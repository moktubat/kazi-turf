import "server-only";
import { policies } from "@/data/site";
import { formatTime } from "@/lib/format";
import { ChangeRequestModel, PaymentModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { settle, toDto } from "@/server/bookings";
import { connectDb } from "@/server/db/connect";
import type { AdminBookingDto, CheckInState } from "@/types/admin";
import type { Booking } from "@/types/booking";

export function checkInState(
    b: Booking,
    now: Date
): { state: CheckInState; message: string; opensAt: string } {
    const opens = new Date(
        new Date(b.startAt).getTime() -
        policies.checkInOpensMinutesBefore * 60_000
    );

    const opensAt = opens.toISOString();

    switch (b.bookingStatus) {
        case "CHECKED_IN":
            return {
                opensAt,
                state: "BLOCKED",
                message: `Already checked in${b.checkedInAt ? ` at ${formatTime(b.checkedInAt)}` : ""
                    }.`,
            };

        case "CANCELLED":
            return {
                opensAt,
                state: "BLOCKED",
                message: "This booking was cancelled.",
            };

        case "EXPIRED":
            return {
                opensAt,
                state: "BLOCKED",
                message: "This hold expired and was released.",
            };

        case "PENDING_PAYMENT":
            return {
                opensAt,
                state: "BLOCKED",
                message: "The advance payment is not verified yet.",
            };

        case "COMPLETED":
            return {
                opensAt,
                state: "BLOCKED",
                message: "This booking is already completed.",
            };

        default:
            break;
    }

    if (now < opens) {
        return {
            opensAt,
            state: "OUTSIDE_WINDOW",
            message: `Check-in opens at ${formatTime(opens)}.`,
        };
    }

    if (now >= new Date(b.endAt)) {
        return {
            opensAt,
            state: "OUTSIDE_WINDOW",
            message: "This slot has already ended.",
        };
    }

    return {
        opensAt,
        state: "VALID",
        message: "Check-in is open.",
    };
}

export function canCollectBalance(b: Booking): boolean {
    return (
        (b.bookingStatus === "CONFIRMED" ||
            b.bookingStatus === "CHECKED_IN") &&
        b.paymentStatus === "PARTIALLY_PAID" &&
        b.balanceAmount > 0
    );
}

type OpenRequestDoc = { bookingCode: string; kind: "CANCEL" | "RESCHEDULE"; reason: string; createdAt: string };
type PaymentDoc = {
    id: string; bookingId: string; provider: "BKASH" | "CASH"; kind: "ADVANCE" | "BALANCE"; amount: number;
    status: "PENDING" | "SUCCESS" | "FAILED"; providerTxnId?: string; verifiedAt?: string; createdAt: string;
};
/** A booking's open change request and its payments (oldest first), loaded ahead of time. */
interface Related {
    openReq: OpenRequestDoc | null;
    pays: PaymentDoc[];
}

/**
 * Many bookings at once (the Bookings list): two queries for the whole page instead of
 * two per row. Same output as calling toAdminDto on each booking.
 */
export async function toAdminDtos(rows: Booking[], viewer: ServerUser, now: Date = new Date()): Promise<AdminBookingDto[]> {
    if (rows.length === 0) return [];
    await connectDb();
    const [reqs, pays] = await Promise.all([
        ChangeRequestModel.find({ bookingCode: { $in: rows.map((b) => b.bookingCode) }, status: "OPEN" }).lean<OpenRequestDoc[]>(),
        PaymentModel.find({ bookingId: { $in: rows.map((b) => b.id) } }).sort({ createdAt: 1 }).lean<PaymentDoc[]>(),
    ]);
    const reqBy = new Map<string, OpenRequestDoc>();
    for (const r of reqs) if (!reqBy.has(r.bookingCode)) reqBy.set(r.bookingCode, r); // findOne: first match wins
    const paysBy = new Map<string, PaymentDoc[]>();
    for (const p of pays) paysBy.set(p.bookingId, [...(paysBy.get(p.bookingId) ?? []), p]);
    return Promise.all(
        rows.map((b) => toAdminDto(b, viewer, now, { openReq: reqBy.get(b.bookingCode) ?? null, pays: paysBy.get(b.id) ?? [] }))
    );
}

export async function toAdminDto(
    b0: Booking,
    viewer: ServerUser,
    now: Date = new Date(),
    related?: Related
): Promise<AdminBookingDto> {
    const b = await settle(b0, now);

    await connectDb();

    const [openReq, pays] = related
        ? [related.openReq, related.pays]
        : await Promise.all([
            ChangeRequestModel.findOne({
                bookingCode: b.bookingCode,
                status: "OPEN",
            }).lean<OpenRequestDoc | null>(),

            PaymentModel.find({ bookingId: b.id })
                .sort({ createdAt: 1 })
                .lean<PaymentDoc[]>(),
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
        note: b.note ?? null,

        payments: pays.map((p) => ({
            id: p.id,
            provider: p.provider,
            kind: p.kind,
            amount: p.amount,
            status: p.status,
            reference: p.providerTxnId ?? null,
            at: p.verifiedAt ?? p.createdAt,
        })),

        changeRequest: openReq
            ? {
                kind: openReq.kind,
                reason: openReq.reason,
                createdAt: openReq.createdAt,
            }
            : null,

        checkIn: {
            state: check.state,
            message: check.message,
            opensAt: check.opensAt,
        },

        can: {
            checkIn: check.state !== "BLOCKED",

            overrideCheckIn:
                viewer.role === "SUPER_ADMIN" &&
                b.bookingStatus === "CHECKED_IN",

            collectBalance: canCollectBalance(b),

            cancel:
                (b.bookingStatus === "CONFIRMED" ||
                    b.bookingStatus === "PENDING_PAYMENT") &&
                b.paymentStatus !== "PENDING",

            refund:
                viewer.role === "SUPER_ADMIN" &&
                b.paymentStatus === "REFUND_PENDING",

            handleRequest: !!openReq,
        },

        vatRegistrationNo:
            b.vatRatePercentSnapshot && policies.vatRegistrationNo
                ? policies.vatRegistrationNo
                : "",
    };
}
