// Customer-facing booking lists and change requests. Reuses toDto() from the booking module.
import "server-only";
import { randomUUID } from "crypto";
import { AppError } from "@/server/http";
import { store } from "@/server/store";
import type { ServerUser } from "@/server/auth/session";
import type { AccountBookingDto, ChangeRequest, ChangeRequestInfo, ChangeKind } from "@/types/account";
import type { Booking } from "@/types/booking";
import { toDto } from "./index";
import { logAudit } from "../audit";

function decorate(b: Booking, now: Date): AccountBookingDto {
    const open = store.changeRequests.find((r) => r.bookingCode === b.bookingCode && r.status === "OPEN");
    return {
        ...toDto(b, now),
        paymentReference: null, // TODO(payments): bKash transaction reference from Payment
        changeRequest: open ? { kind: open.kind, status: open.status, createdAt: open.createdAt } : null,
        canRequestChange: b.bookingStatus === "CONFIRMED" && new Date(b.startAt) > now && !open,
    };
}

export function listAccountBookings(user: ServerUser, now: Date = new Date()) {
    const mine = store.bookings.filter((b) => b.customerId === user.id);

    const upcoming: AccountBookingDto[] = [];
    const history: AccountBookingDto[] = [];

    for (const b of mine) {
        const dto = decorate(b, now);
        const live = (b.bookingStatus === "CONFIRMED" || b.bookingStatus === "CHECKED_IN") && new Date(b.endAt) > now;
        const holding = b.bookingStatus === "PENDING_PAYMENT" && dto.holdActive;

        if (live || holding) upcoming.push(dto);
        else if (["CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED"].includes(b.bookingStatus)) history.push(dto);
        // Abandoned or expired unpaid holds are not shown.
    }

    upcoming.sort((a, b) => a.startAt.localeCompare(b.startAt));
    history.sort((a, b) => b.startAt.localeCompare(a.startAt));
    return { upcoming, history };
}

export function requestChange(
    user: ServerUser,
    code: string,
    input: { kind: ChangeKind; reason: string },
    now: Date = new Date()
): ChangeRequestInfo {
    const b = store.bookings.find((x) => x.bookingCode === code && x.customerId === user.id);
    if (!b) throw new AppError("NOT_FOUND", "Booking not found.", 404);

    if (b.bookingStatus !== "CONFIRMED" || new Date(b.startAt) <= now) {
        throw new AppError("NOT_ELIGIBLE", "This booking can no longer be changed online. Please contact the venue.", 409);
    }
    if (store.changeRequests.some((r) => r.bookingCode === code && r.status === "OPEN")) {
        throw new AppError("ALREADY_REQUESTED", "You already have an open request for this booking.", 409);
    }

    const r: ChangeRequest = {
        id: randomUUID(),
        bookingCode: code,
        customerId: user.id,
        kind: input.kind,
        reason: input.reason,
        status: "OPEN",
        createdAt: now.toISOString(),
    };
    store.changeRequests.push(r);

    logAudit(user, {
        action: "CHANGE_REQUESTED",
        entityType: "BOOKING",
        entityId: code,
        branchId: b.branchId,
        meta: { kind: input.kind },
    });

    return { kind: r.kind, status: r.status, createdAt: r.createdAt };
}