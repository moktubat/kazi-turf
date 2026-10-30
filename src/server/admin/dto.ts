import "server-only";
import { policies } from "@/data/site";
import { formatTime } from "@/lib/format";
import { ChangeRequestModel, PaymentModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { settle } from "@/server/bookings";
import { toDto } from "@/server/bookings";
import { connectDb } from "@/server/db/connect";
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

export async function toAdminDto(b0: Booking, viewer: ServerUser, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await settle(b0, now); // expired unpaid holds become EXPIRED and free their cells
    await connectDb();
    const [openReq, pays] = await Promise.all([
        ChangeRequestModel.findOne({ bookingCode: b.bookingCode, status: "OPEN" }).lean<any>(),
        PaymentModel.find({ bookingId: b.id }).sort({ createdAt: 1 }).lean<any[]>(),
    ]);

    const base = toDto(b, now);
    const check = checkInState(b, now);

    return {
        ...base,
        customerName: b.customerName,
        phone: b.phone,
        source: b.source,
        checkedInAt: b.checkedInAt ?? null,
        cancelReason: b.cancelReason ?? null,
        payments: pays.map((p) => ({
            id: p.id,
            provider: p.provider,
            kind: p.kind,
            amount: p.amount,
            status: p.status,
            reference: p.providerTxnId ?? null,
            at: p.verifiedAt ?? p.createdAt,
        })),
        changeRequest: openReq ? { kind: openReq.kind, reason: openReq.reason, createdAt: openReq.createdAt } : null,
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