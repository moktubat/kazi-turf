// Check-in, balance, cancellation, refund state, change requests and maintenance blocks.
// Every state change is a conditional update, so two phones tapping at once cannot both win.
import "server-only";
import { randomUUID } from "crypto";
import type { ClientSession } from "mongoose";
import { dhakaParts } from "@/lib/time";
import { BookingModel, ChangeRequestModel, CheckInModel, PaymentModel, SlotClaimModel } from "@/models";
import type { CheckInInput } from "@/schemas/admin";
import { logAudit } from "@/server/audit";
import { assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { getPitch, getPitchAvailability } from "@/server/availability";
import { findBookingById, releaseClaims, settle } from "@/server/bookings";
import { insertClaims } from "@/server/claims";
import { connectDb, tx } from "@/server/db/connect";
import { AppError } from "@/server/http";
import type { AdminBookingDto } from "@/types/admin";
import type { Booking } from "@/types/booking";
import { assertSuperAdmin, findBookingForStaff } from "./access";
import { canCollectBalance, checkInState, toAdminDto } from "./dto";

const fresh = async (b: Booking) => (await findBookingById(b.id)) ?? b;

/** Marks the balance paid and records the cash, inside the caller's transaction. */
async function cashIn(b: Booking, user: ServerUser, now: Date, s: ClientSession): Promise<number> {
    const r = await BookingModel.updateOne(
        { id: b.id, paymentStatus: "PARTIALLY_PAID", bookingStatus: { $in: ["CONFIRMED", "CHECKED_IN"] } },
        { $set: { paymentStatus: "PAID" } },
        { session: s }
    );
    if (r.modifiedCount === 0) throw new AppError("ALREADY_PAID", "The balance was already collected.", 409);

    await PaymentModel.create(
        [
            {
                id: randomUUID(),
                bookingId: b.id,
                provider: "CASH",
                kind: "BALANCE",
                amount: b.balanceAmount,
                currency: "BDT",
                status: "SUCCESS",
                verifiedAt: now.toISOString(),
                receivedBy: user.id,
                createdAt: now.toISOString(),
            },
        ],
        { session: s }
    );
    await logAudit(
        user,
        { action: "BALANCE_COLLECTED", entityType: "BOOKING", entityId: b.bookingCode, branchId: b.branchId, meta: { amount: b.balanceAmount } },
        { session: s }
    );
    return b.balanceAmount;
}

export async function collectBalance(user: ServerUser, code: string, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await settle(await findBookingForStaff(user, code), now);
    if (b.paymentStatus === "PAID") throw new AppError("ALREADY_PAID", "The balance was already collected.", 409);
    if (!canCollectBalance(b)) throw new AppError("NOT_COLLECTABLE", "There is no balance to collect on this booking.", 409);
    await tx((s) => cashIn(b, user, now, s));
    return toAdminDto(await fresh(b), user, now);
}

export async function checkIn(user: ServerUser, code: string, input: CheckInInput, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await settle(await findBookingForStaff(user, code), now);
    const state = checkInState(b, now);
    let result: "OK" | "OVERRIDE" = "OK";
    let overrideReason: string | undefined;

    if (state.state === "BLOCKED") {
        // Only a Super Admin may re-check-in a booking, and only with a reason (logged).
        const allowed = b.bookingStatus === "CHECKED_IN" && user.role === "SUPER_ADMIN" && !!input.overrideReason;
        if (!allowed) {
            await logAudit(user, {
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

    await tx(async (s) => {
        let collected = 0;
        if (input.collectBalance && canCollectBalance(b)) collected = await cashIn(b, user, now, s);

        if (b.bookingStatus !== "CHECKED_IN") {
            // Conditional: a second phone checking in the same booking changes nothing and is rejected.
            const r = await BookingModel.updateOne(
                { id: b.id, bookingStatus: "CONFIRMED" },
                { $set: { bookingStatus: "CHECKED_IN", checkedInAt: now.toISOString() } },
                { session: s }
            );
            if (r.modifiedCount === 0) {
                throw new AppError("CHECKIN_BLOCKED", "This booking was just checked in or changed. Refresh to see its status.", 409);
            }
        }

        await CheckInModel.create(
            [{ id: randomUUID(), bookingId: b.id, checkedInAt: now.toISOString(), checkedInBy: user.id, result, balanceCollected: collected }],
            { session: s }
        );
        await logAudit(
            user,
            {
                action: result === "OVERRIDE" ? "CHECKIN_OVERRIDE" : "CHECKED_IN",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: { balanceCollected: collected, verifiedBy: input.identity.method, ...(overrideReason ? { reason: overrideReason } : {}) },
            },
            { session: s }
        );
    });

    return toAdminDto(await fresh(b), user, now);
}

export async function cancelBooking(user: ServerUser, code: string, reason: string, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await settle(await findBookingForStaff(user, code), now);

    if (b.bookingStatus !== "CONFIRMED" && b.bookingStatus !== "PENDING_PAYMENT") {
        throw new AppError("NOT_CANCELLABLE", "This booking can no longer be cancelled.", 409);
    }
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "A payment is being processed. Try again shortly.", 409);
    }

    // Money already received is never silently kept: it goes to REFUND_PENDING for the Super Admin.
    const moneyIn = b.paymentStatus === "PARTIALLY_PAID" || b.paymentStatus === "PAID";
    const received = (await PaymentModel.find({ bookingId: b.id, status: "SUCCESS" }, { amount: 1 }).lean<{ amount: number }[]>()).reduce(
        (sum, p) => sum + p.amount,
        0
    );

    await tx(async (s) => {
        // Must still be in exactly the state we read, or someone changed it first.
        const r = await BookingModel.updateOne(
            { id: b.id, bookingStatus: b.bookingStatus, paymentStatus: b.paymentStatus },
            {
                $set: {
                    bookingStatus: "CANCELLED",
                    cancelledAt: now.toISOString(),
                    cancelReason: reason,
                    paymentStatus: moneyIn ? "REFUND_PENDING" : "CANCELLED",
                },
            },
            { session: s }
        );
        if (r.modifiedCount === 0) {
            throw new AppError("CHANGED", "This booking just changed. Refresh and try again.", 409);
        }
        await releaseClaims(b.id, s);
        await ChangeRequestModel.updateMany({ bookingCode: b.bookingCode, status: "OPEN" }, { $set: { status: "HANDLED" } }, { session: s });
        await logAudit(
            user,
            {
                action: "BOOKING_CANCELLED",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: { reason, refundPending: moneyIn, amountCollected: received },
            },
            { session: s }
        );
    });
    return toAdminDto(await fresh(b), user, now);
}

export async function recordRefund(user: ServerUser, code: string, note: string | undefined, now: Date = new Date()): Promise<AdminBookingDto> {
    assertSuperAdmin(user);
    const b = await findBookingForStaff(user, code);

    await tx(async (s) => {
        const r = await BookingModel.updateOne(
            { id: b.id, paymentStatus: "REFUND_PENDING" },
            { $set: { paymentStatus: "REFUNDED" } },
            { session: s }
        );
        if (r.modifiedCount === 0) throw new AppError("NOT_REFUNDABLE", "There is no pending refund on this booking.", 409);
        await logAudit(
            user,
            { action: "REFUND_RECORDED", entityType: "BOOKING", entityId: b.bookingCode, branchId: b.branchId, meta: { note: note ?? null } },
            { session: s }
        );
    });
    return toAdminDto(await fresh(b), user, now);
}

export async function handleChangeRequest(user: ServerUser, code: string, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await findBookingForStaff(user, code);
    const r = await ChangeRequestModel.findOneAndUpdate(
        { bookingCode: b.bookingCode, status: "OPEN" },
        { $set: { status: "HANDLED" } }
    ).lean<{ kind: string }>();
    if (!r) throw new AppError("NOT_FOUND", "There is no open request on this booking.", 404);

    await logAudit(user, {
        action: "CHANGE_REQUEST_HANDLED",
        entityType: "BOOKING",
        entityId: b.bookingCode,
        branchId: b.branchId,
        meta: { kind: r.kind },
    });
    return toAdminDto(b, user, now);
}

export async function setBlock(
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
    const cell = (await getPitchAvailability(pitch.id, date, now, { allowStarted: true })).find(
        (c) => c.cellStart === d.toISOString()
    );
    if (!cell) throw new AppError("INVALID_SLOT", "That slot is not on this pitch's schedule.", 400);

    const meta = { pitch: pitch.name, date, start: cell.start };
    const entityId = `${pitch.id}@${cell.cellStart}`;
    await connectDb();

    if (input.block) {
        if (cell.status === "PAST") throw new AppError("SLOT_PAST", "That slot has already ended.", 409);
        await tx(async (s) => {
            await insertClaims(pitch.id, [cell.cellStart], { state: "MAINTENANCE", reason: input.reason }, now, s);
            await logAudit(
                user,
                { action: "SLOT_BLOCKED", entityType: "SLOT", entityId, branchId: pitch.branchId, meta: { ...meta, reason: input.reason ?? null } },
                { session: s }
            );
        });
    } else {
        await tx(async (s) => {
            const r = await SlotClaimModel.deleteOne({ pitchId: pitch.id, cellStart: cell.cellStart, state: "MAINTENANCE" }, { session: s });
            if (r.deletedCount === 0) throw new AppError("NOT_FOUND", "This slot is not blocked.", 404);
            await logAudit(user, { action: "SLOT_UNBLOCKED", entityType: "SLOT", entityId, branchId: pitch.branchId, meta }, { session: s });
        });
    }
    return { ok: true };
}