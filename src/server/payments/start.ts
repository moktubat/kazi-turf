import "server-only";
import { randomUUID } from "crypto";
import { policies } from "@/data/site";
import { BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { findOwned, settle } from "@/server/bookings";
import { restoreHoldExpiry } from "@/server/claims";
import { tx } from "@/server/db/connect";
import { AppError } from "@/server/http";
import type { Payment } from "@/types/ops";
import { bkashConfigured, bkashCreate } from "./bkash";

const PAYABLE = ["NOT_STARTED", "FAILED", "CANCELLED"];

/**
 * How long the claims stay held once checkout starts: settle.ts abandons a payment after
 * holdMinutes + 2 min; the extra 5 min lets the reconcile job verify it before the cells free up.
 */
const PAYMENT_WINDOW_MS = (policies.holdMinutes + 2 + 5) * 60_000;

export async function startBkashPayment(
    user: ServerUser,
    code: string,
    now: Date = new Date()
): Promise<{ redirectUrl: string }> {
    if (!bkashConfigured()) {
        throw new AppError(
            "PAYMENT_UNAVAILABLE",
            "Online payment is not available yet. Please contact the venue.",
            503
        );
    }
    const base = process.env.AUTH_URL?.replace(/\/+$/, "");
    if (!base) {
        throw new AppError("PAYMENT_UNAVAILABLE", "Online payment is not available yet.", 503);
    }

    const b = await settle(await findOwned(code, user), now);

    if (b.bookingStatus !== "PENDING_PAYMENT") {
        throw new AppError("NOT_PAYABLE", "This booking is not waiting for payment.", 409);
    }
    if (new Date(b.holdExpiresAt) <= now) {
        throw new AppError("HOLD_EXPIRED", "Your hold has expired. Pick the slot again.", 409);
    }
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "A payment is already being processed.", 409);
    }
    if (!PAYABLE.includes(b.paymentStatus)) {
        throw new AppError("NOT_PAYABLE", "This booking is not waiting for payment.", 409);
    }

    const amount = b.advanceAmount;
    if (
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 10 || // bKash minimum
        amount > 1_000_000 // sanity cap
    ) {
        throw new AppError(
            "INVALID_AMOUNT",
            "The advance amount on this booking is invalid. Pick the slot again or contact the venue.",
            400,
            { amount: "Invalid advance amount" }
        );
    }

    const held = await SlotClaimModel.countDocuments({ bookingId: b.id, state: "HELD" });
    if (held !== b.cellStarts.length) {
        throw new AppError("SLOT_UNAVAILABLE", "That slot is no longer held. Pick again.", 409);
    }

    const attempt = (await PaymentModel.countDocuments({ bookingId: b.id, provider: "BKASH" })) + 1;
    const payment: Payment = {
        id: randomUUID(),
        bookingId: b.id,
        provider: "BKASH",
        kind: "ADVANCE",
        amount,
        currency: "BDT",
        status: "PENDING",
        invoice: `${b.bookingCode.replace("-", "")}${attempt}`,
        createdAt: now.toISOString(),
    };

    const started = await tx(async (s) => {
        const r = await BookingModel.updateOne(
            {
                id: b.id,
                bookingStatus: "PENDING_PAYMENT",
                paymentStatus: { $in: PAYABLE },
                holdExpiresAt: { $gt: now.toISOString() },
            },
            { $set: { paymentStatus: "PENDING" } },
            { session: s }
        );
        if (r.modifiedCount === 0) return false;
        // Keep the cells claimed while the customer is on the bKash page. Without this the
        // HELD claims lapse at the original hold time, another customer can take the slot,
        // and the first customer is charged for a slot they no longer have. Only the claims
        // are extended (not the booking's holdExpiresAt), so a failed or abandoned payment
        // still expires the booking and frees the cells as before.
        const c = await SlotClaimModel.updateMany(
            { bookingId: b.id, state: "HELD", expiresAt: { $gt: now.toISOString() } },
            { $max: { expiresAt: new Date(now.getTime() + PAYMENT_WINDOW_MS).toISOString() } },
            { session: s }
        );
        if (c.matchedCount !== b.cellStarts.length) {
            throw new AppError("SLOT_UNAVAILABLE", "That slot is no longer held. Pick again.", 409);
        }
        await PaymentModel.create([payment], { session: s });
        return true;
    });
    if (!started) {
        throw new AppError("PAYMENT_IN_PROGRESS", "A payment is already being processed.", 409);
    }

    try {
        const r = await bkashCreate({
            amount: payment.amount,
            invoice: payment.invoice!,
            payerReference: b.phone,
            callbackURL: `${base}/api/payments/bkash/callback`,
        });
        await PaymentModel.updateOne({ id: payment.id }, { $set: { providerPaymentId: r.paymentId } });
        return { redirectUrl: r.redirectUrl };
    } catch (e) {
        const failed = await PaymentModel.updateOne(
            { id: payment.id, status: "PENDING" },
            { $set: { status: "FAILED", failureReason: "CREATE_FAILED" } }
        );
        // bKash never opened: undo the claim extension. Done while the booking is still
        // PENDING (before it is restored below), so no new checkout can interleave.
        if (failed.modifiedCount > 0) await restoreHoldExpiry(b.id, b.holdExpiresAt);
        await BookingModel.updateOne(
            { id: b.id, paymentStatus: "PENDING" },
            { $set: { paymentStatus: b.paymentStatus } }
        );
        console.error("[bkash] create failed:", e instanceof Error ? e.message : "unknown error");
        throw new AppError("PAYMENT_START_FAILED", "We could not open bKash. Please try again.", 502);
    }
}