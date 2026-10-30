import "server-only";
import { randomUUID } from "crypto";
import { BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { findOwned, settle } from "@/server/bookings";
import { tx } from "@/server/db/connect";
import { AppError } from "@/server/http";
import type { Payment } from "@/types/ops";
import { bkashConfigured, bkashCreate } from "./bkash";

const PAYABLE = ["NOT_STARTED", "FAILED", "CANCELLED"];

/** Creates a bKash attempt for the SERVER-calculated advance. The browser sends only the booking code. */
export async function startBkashPayment(
    user: ServerUser,
    code: string,
    now: Date = new Date()
): Promise<{ redirectUrl: string }> {
    if (!bkashConfigured()) {
        throw new AppError("PAYMENT_UNAVAILABLE", "Online payment is not available yet. Please contact the venue.", 503);
    }
    const base = process.env.AUTH_URL?.replace(/\/+$/, "");
    if (!base) throw new AppError("PAYMENT_UNAVAILABLE", "Online payment is not available yet.", 503);

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

    // The cells must still be ours before any money moves.
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
        amount: b.advanceAmount,
        currency: "BDT",
        status: "PENDING",
        invoice: `${b.bookingCode.replace("-", "")}${attempt}`,
        createdAt: now.toISOString(),
    };

    // Atomic: only one concurrent tap can move the booking to PENDING and record the attempt.
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
        await PaymentModel.create([payment], { session: s });
        return true;
    });
    if (!started) throw new AppError("PAYMENT_IN_PROGRESS", "A payment is already being processed.", 409);

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
        await PaymentModel.updateOne({ id: payment.id, status: "PENDING" }, { $set: { status: "FAILED", failureReason: "CREATE_FAILED" } });
        await BookingModel.updateOne({ id: b.id, paymentStatus: "PENDING" }, { $set: { paymentStatus: b.paymentStatus } });
        console.error("[bkash] create failed:", e instanceof Error ? e.message : "unknown error");
        throw new AppError("PAYMENT_START_FAILED", "We could not open bKash. Please try again.", 502);
    }
}