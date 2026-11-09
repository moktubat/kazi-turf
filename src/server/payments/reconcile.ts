import "server-only";
import { BookingModel, PaymentModel, SlotClaimModel, UserModel } from "@/models";
import { SETTLEABLE, settle } from "@/server/bookings";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import type { Booking } from "@/types/booking";
import { settlePayment } from "./settle";
import { bookingConfirmationTemplate } from "../email/templates";
import { sendEmail } from "@/server/email";
import { getPitch } from "@/server/availability";

const g = globalThis as unknown as { __ktChecked?: Map<string, number> };

/** Convert an ISO datetime to a "HH:MM" string in Asia/Dhaka. */
function isoToDhakaTime(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(iso));
}

/**
 * Send the booking confirmation email after a payment is confirmed.
 *
 * The Booking model stores `startAt`/`endAt` (ISO) and `pitchId`, but NOT
 * `pitchName`/`sport`/`start`/`end` (those are DTO display fields). So:
 *  - start/end → convert startAt/endAt from ISO to Dhaka "HH:MM"
 *  - pitchName/sport → look up via getPitch() (in-memory pitch registry)
 */
async function sendBookingConfirmation(bookingId: string): Promise<void> {
    try {
        const b = await BookingModel.findOne({ id: bookingId }).lean<Booking>();
        if (!b) return;
        if (!b.customerId) return; // walk-in — no email

        const u = await UserModel.findOne(
            { id: b.customerId },
            { email: 1 }
        ).lean<{ email: string | null }>();
        if (!u?.email) return;

        const pitch = getPitch(b.pitchId);

        const tpl = bookingConfirmationTemplate({
            name: b.customerName,
            code: b.bookingCode,
            pitchName: pitch?.name ?? "Field",
            sport: pitch?.sport ?? "",
            date: b.date,
            start: isoToDhakaTime(b.startAt),
            end: isoToDhakaTime(b.endAt),
            total: b.total,
            advance: b.advanceAmount,
            balance: b.balanceAmount,
        });

        await sendEmail({
            to: u.email,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
        });
    } catch (e) {
        console.error(
            "[email] Booking confirmation failed:",
            e instanceof Error ? e.message : e
        );
    }
}

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

    const result = await settlePayment(p.id, "reconcile", now);
    if (result === "CONFIRMED") {
        void sendBookingConfirmation(b.id);
    }
}

/** Cron job: settle PENDING bKash payments, expire stale holds, drop expired HELD claims. */
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

    await SlotClaimModel.deleteMany({ state: "HELD", expiresAt: { $lte: nowIso } });

    const due = await PaymentModel.find({
        provider: "BKASH",
        status: "PENDING",
        createdAt: { $lte: new Date(now.getTime() - minAgeMs).toISOString() },
    })
        .limit(limit)
        .lean<{ id: string; bookingId: string }[]>();

    const summary = { checked: due.length, confirmed: 0, refund: 0, failed: 0, pending: 0, expiredHolds: expiring.length };
    for (const p of due) {
        const r = await settlePayment(p.id, "reconcile", now);
        if (r === "CONFIRMED") {
            summary.confirmed++;
            void sendBookingConfirmation(p.bookingId);
        } else if (r === "REFUND") summary.refund++;
        else if (r === "FAILED") summary.failed++;
        else summary.pending++;
    }
    return summary;
}