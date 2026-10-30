import "server-only";
import { randomUUID } from "crypto";
import { AppError } from "@/server/http";
import { findOwned, settle } from "@/server/bookings";
import type { ServerUser } from "@/server/auth/session";
import { store } from "@/server/store";
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

    const b = findOwned(code, user);
    settle(b, now);

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
    const held = store.claims.filter((c) => c.bookingId === b.id && c.state === "HELD");
    if (held.length !== b.cellStarts.length) {
        throw new AppError("SLOT_UNAVAILABLE", "That slot is no longer held. Pick again.", 409);
    }

    const attempt = store.payments.filter((p) => p.bookingId === b.id && p.provider === "BKASH").length + 1;
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

    const previous = b.paymentStatus;
    store.payments.push(payment);
    b.paymentStatus = "PENDING"; // set before any await: a second tap cannot start another attempt

    try {
        const r = await bkashCreate({
            amount: payment.amount,
            invoice: payment.invoice!,
            payerReference: b.phone,
            callbackURL: `${base}/api/payments/bkash/callback`,
        });
        payment.providerPaymentId = r.paymentId;
        return { redirectUrl: r.redirectUrl };
    } catch (e) {
        payment.status = "FAILED";
        payment.failureReason = "CREATE_FAILED";
        b.paymentStatus = previous;
        console.error("[bkash] create failed:", e instanceof Error ? e.message : "unknown error");
        throw new AppError("PAYMENT_START_FAILED", "We could not open bKash. Please try again.", 502);
    }
}