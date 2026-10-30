import "server-only";
import { policies } from "@/data/site";
import { formatTime } from "@/lib/format";
import type { ServerUser } from "@/server/auth/session";
import { settle, toDto } from "@/server/bookings";
import { store } from "@/server/store";
import type { AdminBookingDto, CheckInState } from "@/types/admin";
import type { Booking } from "@/types/booking";

export function checkInState(
    b: Booking,
    now: Date
): { state: CheckInState; message: string; opensAt: string } {
    const opens = new Date(new Date(b.startAt).getTime() - policies.checkInOpensMinutesBefore * 60_000);
    const opensAt = opens.toISOString();

    switch (b.bookingStatus) {
        case "CHECKED_IN":
            return {
                opensAt,
                state: "BLOCKED",
                message: `Already checked in${b.checkedInAt ? ` at ${formatTime(b.checkedInAt)}` : ""}.`,
            };
        case "CANCELLED":
            return { opensAt, state: "BLOCKED", message: "This booking was cancelled." };
        case "EXPIRED":
            return { opensAt, state: "BLOCKED", message: "This hold expired and was released." };
        case "PENDING_PAYMENT":
            return { opensAt, state: "BLOCKED", message: "The advance payment is not verified yet." };
        case "COMPLETED":
            return { opensAt, state: "BLOCKED", message: "This booking is already completed." };
        default:
            break;
    }

    if (now < opens) {
        return { opensAt, state: "OUTSIDE_WINDOW", message: `Check-in opens at ${formatTime(opens)}.` };
    }
    if (now >= new Date(b.endAt)) {
        return { opensAt, state: "OUTSIDE_WINDOW", message: "This slot has already ended." };
    }
    return { opensAt, state: "VALID", message: "Check-in is open." };
}

export function canCollectBalance(b: Booking): boolean {
    return (
        (b.bookingStatus === "CONFIRMED" || b.bookingStatus === "CHECKED_IN") &&
        b.paymentStatus === "PARTIALLY_PAID" &&
        b.balanceAmount > 0
    );
}

export function toAdminDto(b: Booking, viewer: ServerUser, now: Date = new Date()): AdminBookingDto {
    settle(b, now); // expired unpaid holds become EXPIRED and free their cells
    const base = toDto(b, now);
    const check = checkInState(b, now);
    const openReq = store.changeRequests.find((r) => r.bookingCode === b.bookingCode && r.status === "OPEN") ?? null;

    const payments = store.payments
        .filter((p) => p.bookingId === b.id)
        .sort((a, c) => a.createdAt.localeCompare(c.createdAt))
        .map((p) => ({
            id: p.id,
            provider: p.provider,
            kind: p.kind,
            amount: p.amount,
            status: p.status,
            reference: p.providerTxnId ?? null,
            at: p.verifiedAt ?? p.createdAt,
        }));

    return {
        ...base,
        customerName: b.customerName,
        phone: b.phone,
        source: b.source,
        checkedInAt: b.checkedInAt ?? null,
        cancelReason: b.cancelReason ?? null,
        payments,
        changeRequest: openReq
            ? { kind: openReq.kind, reason: openReq.reason, createdAt: openReq.createdAt }
            : null,
        checkIn: { state: check.state, message: check.message, opensAt: check.opensAt },
        can: {
            checkIn: check.state !== "BLOCKED",
            overrideCheckIn: viewer.role === "SUPER_ADMIN" && b.bookingStatus === "CHECKED_IN",
            collectBalance: canCollectBalance(b),
            cancel:
                (b.bookingStatus === "CONFIRMED" || b.bookingStatus === "PENDING_PAYMENT") &&
                b.paymentStatus !== "PENDING",
            refund: viewer.role === "SUPER_ADMIN" && b.paymentStatus === "REFUND_PENDING",
            handleRequest: !!openReq,
        },
        vatRegistrationNo:
            b.vatRatePercentSnapshot && policies.vatRegistrationNo ? policies.vatRegistrationNo : "",
    };
}