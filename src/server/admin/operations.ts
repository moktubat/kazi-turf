// Check-in, balance, cancellation, refund state, change requests and maintenance blocks.
import "server-only";
import { randomUUID } from "crypto";
import { dhakaParts } from "@/lib/time";
import { logAudit } from "@/server/audit";
import { assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { getPitch, getPitchAvailability } from "@/server/availability";
import { releaseClaims, settle } from "@/server/bookings";
import { AppError } from "@/server/http";
import { store } from "@/server/store";
import type { CheckInInput } from "@/schemas/admin";
import type { AdminBookingDto } from "@/types/admin";
import type { Booking } from "@/types/booking";
import { assertSuperAdmin, findBookingForStaff } from "./access";
import { claimCells } from "./claims";
import { canCollectBalance, checkInState, toAdminDto } from "./dto";

function cashIn(b: Booking, user: ServerUser, now: Date): number {
    const amount = b.balanceAmount;
    store.payments.push({
        id: randomUUID(),
        bookingId: b.id,
        provider: "CASH",
        kind: "BALANCE",
        amount,
        currency: "BDT",
        status: "SUCCESS",
        verifiedAt: now.toISOString(),
        receivedBy: user.id,
        createdAt: now.toISOString(),
    });
    b.paymentStatus = "PAID";
    logAudit(user, {
        action: "BALANCE_COLLECTED",
        entityType: "BOOKING",
        entityId: b.bookingCode,
        branchId: b.branchId,
        meta: { amount },
    });
    return amount;
}

export function collectBalance(user: ServerUser, code: string, now: Date = new Date()): AdminBookingDto {
    const b = findBookingForStaff(user, code);
    settle(b, now);
    if (b.paymentStatus === "PAID") throw new AppError("ALREADY_PAID", "The balance was already collected.", 409);
    if (!canCollectBalance(b)) throw new AppError("NOT_COLLECTABLE", "There is no balance to collect on this booking.", 409);
    cashIn(b, user, now);
    return toAdminDto(b, user, now);
}

export function checkIn(user: ServerUser, code: string, input: CheckInInput, now: Date = new Date()): AdminBookingDto {
    const b = findBookingForStaff(user, code);
    settle(b, now);
    const state = checkInState(b, now);
    let result: "OK" | "OVERRIDE" = "OK";
    let overrideReason: string | undefined;

    if (state.state === "BLOCKED") {
        // Only a Super Admin may re-check-in a booking, and only with a reason (logged).
        const allowed = b.bookingStatus === "CHECKED_IN" && user.role === "SUPER_ADMIN" && !!input.overrideReason;
        if (!allowed) {
            logAudit(user, {
                action: "CHECKIN_BLOCKED",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: { reason: state.message },
            });
            throw new AppError("CHECKIN_BLOCKED", state.message, 409);
        }
        result = "OVERRIDE";
        overrideReason = input.overrideReason;
    } else if (state.state === "OUTSIDE_WINDOW") {
        if (!input.overrideReason) {
            throw new AppError("OUTSIDE_WINDOW", `${state.message} Add a reason to check in anyway.`, 409);
        }
        result = "OVERRIDE";
        overrideReason = input.overrideReason;
    }

    if (input.identity.method === "PHONE" && input.identity.digits !== b.phone.slice(-4)) {
        throw new AppError("IDENTITY_MISMATCH", "Those digits do not match the booking phone.", 400, {
            identity: "Those digits do not match the booking phone.",
        });
    }

    let collected = 0;
    if (input.collectBalance && canCollectBalance(b)) collected = cashIn(b, user, now);

    if (b.bookingStatus !== "CHECKED_IN") {
        b.bookingStatus = "CHECKED_IN";
        b.checkedInAt = now.toISOString();
    }
    store.checkIns.push({
        id: randomUUID(),
        bookingId: b.id,
        checkedInAt: now.toISOString(),
        checkedInBy: user.id,
        result,
        balanceCollected: collected,
    });

    logAudit(user, {
        action: result === "OVERRIDE" ? "CHECKIN_OVERRIDE" : "CHECKED_IN",
        entityType: "BOOKING",
        entityId: b.bookingCode,
        branchId: b.branchId,
        meta: { balanceCollected: collected, verifiedBy: input.identity.method, ...(overrideReason ? { reason: overrideReason } : {}) },
    });

    return toAdminDto(b, user, now);
}

export function cancelBooking(user: ServerUser, code: string, reason: string, now: Date = new Date()): AdminBookingDto {
    const b = findBookingForStaff(user, code);
    settle(b, now);

    if (b.bookingStatus !== "CONFIRMED" && b.bookingStatus !== "PENDING_PAYMENT") {
        throw new AppError("NOT_CANCELLABLE", "This booking can no longer be cancelled.", 409);
    }
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "A payment is being processed. Try again shortly.", 409);
    }

    // Money already received is never silently kept: it goes to REFUND_PENDING for the Super Admin.
    const moneyIn = b.paymentStatus === "PARTIALLY_PAID" || b.paymentStatus === "PAID";
    const collected = store.payments
        .filter((p) => p.bookingId === b.id && p.status === "SUCCESS")
        .reduce((s, p) => s + p.amount, 0);

    b.bookingStatus = "CANCELLED";
    b.cancelledAt = now.toISOString();
    b.cancelReason = reason;
    b.paymentStatus = moneyIn ? "REFUND_PENDING" : "CANCELLED";
    releaseClaims(b.id);

    for (const r of store.changeRequests) {
        if (r.bookingCode === b.bookingCode && r.status === "OPEN") r.status = "HANDLED";
    }

    logAudit(user, {
        action: "BOOKING_CANCELLED",
        entityType: "BOOKING",
        entityId: b.bookingCode,
        branchId: b.branchId,
        meta: { reason, refundPending: moneyIn, amountCollected: collected },
    });
    return toAdminDto(b, user, now);
}

export function recordRefund(user: ServerUser, code: string, note: string | undefined, now: Date = new Date()): AdminBookingDto {
    assertSuperAdmin(user);
    const b = findBookingForStaff(user, code);
    if (b.paymentStatus !== "REFUND_PENDING") {
        throw new AppError("NOT_REFUNDABLE", "There is no pending refund on this booking.", 409);
    }
    b.paymentStatus = "REFUNDED";
    logAudit(user, {
        action: "REFUND_RECORDED",
        entityType: "BOOKING",
        entityId: b.bookingCode,
        branchId: b.branchId,
        meta: { note: note ?? null },
    });
    return toAdminDto(b, user, now);
}

export function handleChangeRequest(user: ServerUser, code: string, now: Date = new Date()): AdminBookingDto {
    const b = findBookingForStaff(user, code);
    const r = store.changeRequests.find((x) => x.bookingCode === b.bookingCode && x.status === "OPEN");
    if (!r) throw new AppError("NOT_FOUND", "There is no open request on this booking.", 404);
    r.status = "HANDLED";
    logAudit(user, {
        action: "CHANGE_REQUEST_HANDLED",
        entityType: "BOOKING",
        entityId: b.bookingCode,
        branchId: b.branchId,
        meta: { kind: r.kind },
    });
    return toAdminDto(b, user, now);
}

export function setBlock(
    user: ServerUser,
    input: { pitchId: string; cellStart: string; block: boolean; reason?: string },
    now: Date = new Date()
) {
    const pitch = getPitch(input.pitchId);
    if (!pitch) throw new AppError("NOT_FOUND", "Pitch not found.", 404);
    assertBranchAccess(user, pitch.branchId);

    const d = new Date(input.cellStart);
    if (Number.isNaN(d.getTime())) throw new AppError("INVALID_SLOT", "Invalid slot.", 400);
    const date = dhakaParts(d).date;
    const cell = getPitchAvailability(pitch.id, date, now, { allowStarted: true }).find(
        (c) => c.cellStart === d.toISOString()
    );
    if (!cell) throw new AppError("INVALID_SLOT", "That slot is not on this pitch's schedule.", 400);

    const meta = { pitch: pitch.name, date, start: cell.start };

    if (input.block) {
        if (cell.status === "PAST") throw new AppError("SLOT_PAST", "That slot has already ended.", 409);
        claimCells(pitch.id, [cell.cellStart], { state: "MAINTENANCE", reason: input.reason }, now);
        logAudit(user, {
            action: "SLOT_BLOCKED",
            entityType: "SLOT",
            entityId: `${pitch.id}@${cell.cellStart}`,
            branchId: pitch.branchId,
            meta: { ...meta, reason: input.reason ?? null },
        });
    } else {
        const i = store.claims.findIndex(
            (c) => c.pitchId === pitch.id && c.cellStart === cell.cellStart && c.state === "MAINTENANCE"
        );
        if (i < 0) throw new AppError("NOT_FOUND", "This slot is not blocked.", 404);
        store.claims.splice(i, 1);
        logAudit(user, {
            action: "SLOT_UNBLOCKED",
            entityType: "SLOT",
            entityId: `${pitch.id}@${cell.cellStart}`,
            branchId: pitch.branchId,
            meta,
        });
    }
    return { ok: true };
}