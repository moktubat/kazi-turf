import "server-only";
import { BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import { SETTLEABLE, settle } from "@/server/bookings";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import type { Booking } from "@/types/booking";
import { settlePayment } from "./settle";

// The booking confirmation email is sent by settlePayment itself, once, at the moment a
// payment really flips PENDING -> SUCCESS. Nothing here sends it again, so a repeated or
// overlapping run (or a customer's "processing" page polling) never duplicates it.

const g = globalThis as unknown as { __ktChecked?: Map<string, number> };

/** Poll helper: when a customer's page says "processing", ask bKash now (at most every 5 s per payment). */
export async function reconcileBooking(code: string, now: Date = new Date()) {
    await connectDb();
    const b = await BookingModel.findOne({ bookingCode: code }, { id: 1 }).lean<{ id: string }>();
    if (!b) return;
    const p = await PaymentModel.findOne(
        { bookingId: b.id, provider: "BKASH", status: "PENDING" },
        { id: 1 }
    ).lean<{ id: string }>();
    if (!p) return;

    const seen = (g.__ktChecked ??= new Map());
    if (seen.size > 1000) seen.clear();
    if (now.getTime() - (seen.get(p.id) ?? 0) < 5_000) return;
    seen.set(p.id, now.getTime());

    await settlePayment(p.id, "reconcile", now);
}

/**
 * Cron job (cron-job.org every 5 minutes): expire stale holds, drop expired HELD claims,
 * then settle PENDING bKash payments. Safe to run repeatedly or in parallel: every state
 * change is a conditional update inside a transaction (PENDING -> SUCCESS happens once),
 * and the bKash transaction id is unique.
 *
 * `budgetMs`: stop starting new bKash checks after this long so the scheduler gets its
 * answer in time (cron-job.org waits ~30 s); anything left is picked up by the next run.
 */
export async function reconcilePending(
    now: Date = new Date(),
    opts: { minAgeMs?: number; limit?: number; budgetMs?: number } = {}
) {
    const { minAgeMs = 90_000, limit = 25, budgetMs = 20_000 } = opts;
    const startedAt = Date.now();
    await connectDb();
    const nowIso = now.toISOString();

    const expiring = plainAll<Booking>(
        await BookingModel.find({
            bookingStatus: "PENDING_PAYMENT",
            paymentStatus: { $in: SETTLEABLE },
            holdExpiresAt: { $lte: nowIso },
        })
            .limit(200)
            .lean()
    );
    for (const b of expiring) await settle(b, now);

    await SlotClaimModel.deleteMany({ state: "HELD", expiresAt: { $lte: nowIso } });

    const due = await PaymentModel.find({
        provider: "BKASH",
        status: "PENDING",
        createdAt: { $lte: new Date(now.getTime() - minAgeMs).toISOString() },
    })
        .limit(limit)
        .lean<{ id: string; bookingId: string }[]>();

    const summary = { checked: 0, confirmed: 0, refund: 0, failed: 0, pending: 0, deferred: 0, expiredHolds: expiring.length };
    for (const p of due) {
        if (Date.now() - startedAt > budgetMs) {
            summary.deferred++; // next run
            continue;
        }
        summary.checked++;
        const r = await settlePayment(p.id, "reconcile", now);
        if (r === "CONFIRMED") summary.confirmed++;
        else if (r === "REFUND") summary.refund++;
        else if (r === "FAILED") summary.failed++;
        else summary.pending++;
    }
    return summary;
}
