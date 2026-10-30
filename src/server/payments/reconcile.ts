import "server-only";
import { BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import { SETTLEABLE, settle } from "@/server/bookings";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import type { Booking } from "@/types/booking";
import { settlePayment } from "./settle";

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

/** Cron job: settle PENDING bKash payments, expire stale holds, drop expired HELD claims (housekeeping only). */
export async function reconcilePending(now: Date = new Date(), opts: { minAgeMs?: number; limit?: number } = {}) {
    const { minAgeMs = 90_000, limit = 25 } = opts;
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

    // Expiry is enforced on read. This only keeps the collection tidy.
    await SlotClaimModel.deleteMany({ state: "HELD", expiresAt: { $lte: nowIso } });

    const due = await PaymentModel.find({
        provider: "BKASH",
        status: "PENDING",
        createdAt: { $lte: new Date(now.getTime() - minAgeMs).toISOString() },
    })
        .limit(limit)
        .lean<{ id: string }[]>();

    const summary = { checked: due.length, confirmed: 0, refund: 0, failed: 0, pending: 0, expiredHolds: expiring.length };
    for (const p of due) {
        // One at a time: gentle on bKash, and each result is independent.
        const r = await settlePayment(p.id, "reconcile", now);
        if (r === "CONFIRMED") summary.confirmed++;
        else if (r === "REFUND") summary.refund++;
        else if (r === "FAILED") summary.failed++;
        else summary.pending++;
    }
    return summary;
}