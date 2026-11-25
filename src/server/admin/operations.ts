// Check-in, check-out, balance, cancellation, refund state, change requests and maintenance blocks.
// Every state change is a conditional update, so two phones tapping at once cannot both win.
import "server-only";
import { randomUUID } from "crypto";
import type { ClientSession } from "mongoose";
import { policies } from "@/data/site";
import { dhakaParts } from "@/lib/time";
import { counterDiscountAmount, counterDiscountError, type CounterDiscount } from "@/lib/counterDiscount";
import { extraChargeAmount, extraChargeError, EXTRA_CHARGE_REASON_MAX, type ExtraCharge } from "@/lib/extraCharge";
import { vatTotals } from "@/lib/pricing";
import { WALKIN_NOTE_MAX } from "@/lib/walkInNote";
import { BookingModel, ChangeRequestModel, CheckInModel, PaymentModel, SlotClaimModel } from "@/models";
import type { CheckInInput } from "@/schemas/admin";
import { logAudit } from "@/server/audit";
import { assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { getPitch, getPitchAvailability, invalidateAvailability } from "@/server/availability";
import { findBookingById, releaseClaims, settle } from "@/server/bookings";
import { insertClaims } from "@/server/claims";
import { connectDb, tx } from "@/server/db/connect";
import { AppError } from "@/server/http";
import type { AdminBookingDto } from "@/types/admin";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { assertSuperAdmin, findBookingForStaff } from "./access";
import { canCheckOut, canCollectBalance, checkInState, mayReverseCash, toAdminDto } from "./dto";

const fresh = async (b: Booking) => (await findBookingById(b.id)) ?? b;

/**
 * Lowering what a customer owes after money changed hands is a Super Admin decision.
 * Staff may still give a counter discount on a part-paid booking and may always RAISE the
 * total, but they may not lower the total of a fully paid booking, nor lower it so that
 * nothing is left to pay (balance ৳0, or less than was already paid). Otherwise a balance
 * paid in cash could be "discounted away" and the cash kept, or an overpayment created
 * with no refund flag. `field` is the form field the error is shown on.
 */
function assertStaffMayLowerTotal(
    user: ServerUser,
    b: Booking,
    newTotal: number,
    paid: number,
    what: "discount" | "additional charge",
    field: string
) {
    if (user.role === "SUPER_ADMIN" || newTotal >= b.total) return;
    const message =
        b.paymentStatus === "PAID"
            ? `This booking is fully paid. Only a Super Admin can change the ${what} so the total goes down.`
            : `Staff can't change the ${what} so that nothing is left to pay. Ask a Super Admin.`;
    if (b.paymentStatus === "PAID" || newTotal - paid <= 0) {
        throw new AppError("SUPER_ADMIN_REQUIRED", message, 403, { [field]: message });
    }
}

/** Marks the balance paid and records the cash, inside the caller's transaction.
 *  Works on Booked, Checked in AND Checked-out bookings (a past booking whose balance
 *  was never taken can still be settled at the counter). */
async function cashIn(b: Booking, user: ServerUser, now: Date, s: ClientSession): Promise<number> {
    const r = await BookingModel.updateOne(
        { id: b.id, paymentStatus: "PARTIALLY_PAID", bookingStatus: { $in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] } },
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
    // A booking whose check-in was undone counts as already checked in once: checking it
    // in again is a re-check-in, so "undo + check in" cannot get around the Super Admin rule.
    // The CheckIn history also covers bookings undone before checkInUndoneAt existed.
    const wasUndone =
        b.bookingStatus === "CONFIRMED" &&
        (!!b.checkInUndoneAt || !!(await CheckInModel.exists({ bookingId: b.id, undoneAt: { $ne: null } })));
    const state = checkInState(wasUndone && !b.checkInUndoneAt ? { ...b, checkInUndoneAt: now.toISOString() } : b, now);
    let result: "OK" | "OVERRIDE" = "OK";
    let overrideReason: string | undefined;

    if (state.state === "BLOCKED") {
        // Only a Super Admin may re-check-in a booking, and only with a reason (logged).
        const reCheckIn = b.bookingStatus === "CHECKED_IN" || wasUndone;
        const allowed = reCheckIn && user.role === "SUPER_ADMIN" && !!input.overrideReason;
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
        // Staff may check in outside the window; the reason is optional and saved when given.
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
            [{ id: randomUUID(), bookingId: b.id, checkedInAt: now.toISOString(), checkedInBy: user.id, result, balanceCollected: collected, reason: overrideReason ?? null }],
            { session: s }
        );
        await logAudit(
            user,
            {
                action: result === "OVERRIDE" ? "CHECKIN_OVERRIDE" : "CHECKED_IN",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: {
                    balanceCollected: collected,
                    verifiedBy: input.identity.method,
                    ...(result === "OVERRIDE" ? { rule: state.message } : {}),
                    ...(overrideReason ? { reason: overrideReason } : {}),
                },
            },
            { session: s }
        );
    });

    return toAdminDto(await fresh(b), user, now);
}

/**
 * Check out: the game is over and the money is settled — the booking is closed
 * (COMPLETED). Any remaining balance is collected in cash in the same action, so a
 * checked-out booking is always fully paid. The slot claims are NOT released: the
 * booking keeps its slots on the board and in every list. Undoing a check-out puts
 * the booking back to Checked in (or Booked, if it was never checked in).
 */
export async function checkOut(user: ServerUser, code: string, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await settle(await findBookingForStaff(user, code), now);
    if (!canCheckOut(b)) {
        throw new AppError(
            "NOT_CHECKOUTABLE",
            b.bookingStatus === "COMPLETED"
                ? "This booking is already checked out."
                : b.bookingStatus === "PENDING_PAYMENT"
                    ? "The advance payment is not verified yet."
                    : "Only a Booked or Checked-in booking with a settled payment can be checked out.",
            409
        );
    }
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "A payment is being processed. Try again shortly.", 409);
    }

    let collected = 0;
    await tx(async (s) => {
        // A balance still due is collected at the same moment: checked out = payment complete.
        if (canCollectBalance(b)) collected = await cashIn(b, user, now, s);

        // Conditional: if someone changed the booking in between, nothing moves. cashIn
        // (same transaction) has just moved PARTIALLY_PAID → PAID, so match on that.
        const r = await BookingModel.updateOne(
            { id: b.id, bookingStatus: b.bookingStatus, paymentStatus: collected > 0 ? "PAID" : b.paymentStatus },
            { $set: { bookingStatus: "COMPLETED" } },
            { session: s }
        );
        if (r.modifiedCount === 0) {
            throw new AppError("CHANGED", "This booking just changed. Refresh and try again.", 409);
        }
        await logAudit(
            user,
            {
                action: "CHECKED_OUT",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: { balanceCollected: collected },
            },
            { session: s }
        );
    });

    return toAdminDto(await fresh(b), user, now);
}

/**
 * Undo a check-out: the booking goes back to Checked in (or Booked when it was never
 * checked in, e.g. an online booking closed by mistake). Money already collected stays
 * collected, unless `reverseBalance` is set: then the latest cash balance payment is
 * reversed (marked VOIDED, never deleted) because it was not actually received, and the
 * balance shows as due again ("Checked in · Due" / "Booked · Due"). Staff may reverse only
 * cash they recorded themselves today; anything else needs a Super Admin (mayReverseCash).
 * The reason is optional and only feeds the audit trail.
 */
export async function undoCheckOut(
    user: ServerUser,
    code: string,
    reason: string | undefined,
    now: Date = new Date(),
    reverseBalance = false
): Promise<AdminBookingDto> {
    const b = await findBookingForStaff(user, code);
    if (b.bookingStatus !== "COMPLETED") {
        throw new AppError("NOT_CHECKED_OUT", "This booking is not checked out.", 409);
    }

    const backTo: "CHECKED_IN" | "CONFIRMED" = b.checkedInAt ? "CHECKED_IN" : "CONFIRMED";

    // The cash payment to reverse, checked before anything moves.
    let reverse: Payment | null = null;
    let pays: Payment[] = [];
    if (reverseBalance) {
        await connectDb();
        pays = await PaymentModel.find({ bookingId: b.id }).sort({ createdAt: 1 }).lean<Payment[]>();
        const last = [...pays].reverse().find((p) => p.provider === "CASH" && p.kind === "BALANCE" && p.status === "SUCCESS");
        if (!last || b.paymentStatus !== "PAID") {
            throw new AppError("NOTHING_TO_REVERSE", "There is no cash balance payment to reverse on this booking.", 409);
        }
        if (!mayReverseCash(user, last, now)) {
            const message = "Only a Super Admin can reverse this payment (staff can reverse only cash they recorded themselves today).";
            throw new AppError("SUPER_ADMIN_REQUIRED", message, 403);
        }
        reverse = last;
    }

    await tx(async (s) => {
        if (reverse) {
            // Conditional: a payment reversed twice (two phones) changes nothing the second time.
            const v = await PaymentModel.updateOne(
                { id: reverse.id, status: "SUCCESS" },
                { $set: { status: "VOIDED", voidedAt: now.toISOString(), voidedBy: user.id, voidReason: reason ?? "Not received" } },
                { session: s }
            );
            if (v.modifiedCount === 0) throw new AppError("CHANGED", "This payment just changed. Refresh and try again.", 409);
            const paidLeft = pays.filter((p) => p.status === "SUCCESS" && p.id !== reverse.id).reduce((sum, p) => sum + p.amount, 0);
            const balance = Math.max(0, b.total - paidLeft);
            const m = await BookingModel.updateOne(
                { id: b.id, bookingStatus: "COMPLETED", paymentStatus: "PAID" },
                { $set: { paymentStatus: balance > 0 ? "PARTIALLY_PAID" : "PAID", balanceAmount: balance } },
                { session: s }
            );
            if (m.modifiedCount === 0 && balance > 0) throw new AppError("CHANGED", "This booking just changed. Refresh and try again.", 409);
            await logAudit(
                user,
                {
                    action: "PAYMENT_REVERSED",
                    entityType: "BOOKING",
                    entityId: b.bookingCode,
                    branchId: b.branchId,
                    meta: { amount: reverse.amount, balanceDue: balance, ...(reason ? { reason } : {}) },
                },
                { session: s }
            );
        }

        const r = await BookingModel.updateOne(
            { id: b.id, bookingStatus: "COMPLETED" },
            { $set: { bookingStatus: backTo } },
            { session: s }
        );
        if (r.modifiedCount === 0) {
            throw new AppError("CHANGED", "This booking just changed. Refresh and try again.", 409);
        }
        await logAudit(
            user,
            {
                action: "CHECKOUT_UNDONE",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: {
                    backTo,
                    ...(reverse ? { reversed: reverse.amount } : {}),
                    ...(reason ? { reason } : {}),
                },
            },
            { session: s }
        );
    });

    return toAdminDto(await fresh(b), user, now);
}

/**
 * Undo a check-in: the booking goes back to Booked (CONFIRMED) — for example when the
 * customer was checked in by mistake, or staff still need to fix the note or discount.
 * Money already collected stays collected (collecting the balance is independent of the
 * check-in state), and the booking can be checked in again afterwards. The latest
 * check-in record is marked undone rather than deleted, so the trail stays complete.
 */
export async function undoCheckIn(user: ServerUser, code: string, reason: string | undefined, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await findBookingForStaff(user, code);
    if (b.bookingStatus !== "CHECKED_IN") {
        throw new AppError("NOT_CHECKED_IN", "This booking is not checked in.", 409);
    }

    await tx(async (s) => {
        // Conditional: if someone just changed the booking (re-check-in, cancel…), nothing moves.
        const r = await BookingModel.updateOne(
            { id: b.id, bookingStatus: "CHECKED_IN" },
            { $set: { bookingStatus: "CONFIRMED", checkInUndoneAt: now.toISOString() }, $unset: { checkedInAt: "" } },
            { session: s }
        );
        if (r.modifiedCount === 0) {
            throw new AppError("CHANGED", "This booking just changed. Refresh and try again.", 409);
        }
        await CheckInModel.findOneAndUpdate(
            { bookingId: b.id, undoneAt: null },
            { $set: { undoneAt: now.toISOString(), undoneBy: user.id } },
            { sort: { checkedInAt: -1 }, session: s }
        );
        await logAudit(
            user,
            {
                action: "CHECKIN_UNDONE",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: {
                    ...(b.checkedInAt ? { checkedInAt: b.checkedInAt } : {}),
                    ...(reason ? { reason } : {}),
                },
            },
            { session: s }
        );
    });

    return toAdminDto(await fresh(b), user, now);
}

/**
 * Add or change the counter discount after the booking was created — the same discount
 * staff could only give in the walk-in form before. The discount comes off the priced
 * subtotal, VAT is worked out again on what is left, and the total, balance and payment
 * status are recalculated from what the customer has actually paid so far.
 */
export async function updateDiscount(user: ServerUser, code: string, discount: CounterDiscount | null, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await findBookingForStaff(user, code);
    if (b.bookingStatus !== "CONFIRMED" && b.bookingStatus !== "CHECKED_IN") {
        throw new AppError("NOT_EDITABLE", "The discount can only be changed while the booking is Booked or Checked in.", 409);
    }
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "A payment is being processed. Try again shortly.", 409);
    }
    if (b.paymentStatus !== "PARTIALLY_PAID" && b.paymentStatus !== "PAID") {
        throw new AppError("NOT_EDITABLE", "The discount can only be changed on a booked or checked-in booking.", 409);
    }

    // Same rules as the walk-in form: whole taka or whole percent, at most the subtotal.
    const discountError = counterDiscountError(discount, b.subtotal);
    if (discountError) {
        throw new AppError("INVALID_DISCOUNT", `Discount: ${discountError}.`, 400, { discount: discountError });
    }
    const discountAmount = counterDiscountAmount(discount, b.subtotal);
    // An additional charge saved on the walk-in stays on the booking: it is ADDED after
    // the discount, so the recomputed total keeps it.
    const charge =
        typeof b.additionalChargeAmount === "number" && b.additionalChargeAmount > 0 ? b.additionalChargeAmount : 0;
    const { vat, total } = vatTotals(b.subtotal - discountAmount + charge, b.vatRatePercentSnapshot ?? null, policies.vatMode);

    // What the customer has actually paid (successful payments only — the same sum the
    // panel shows). The new balance is the discounted total minus that.
    const paid = (await PaymentModel.find({ bookingId: b.id, status: "SUCCESS" }, { amount: 1 }).lean<{ amount: number }[]>()).reduce(
        (sum, p) => sum + p.amount,
        0
    );
    assertStaffMayLowerTotal(user, b, total, paid, "discount", "discount");
    const balance = Math.max(0, total - paid);
    const paymentStatus = paid > 0 && total <= paid ? "PAID" : "PARTIALLY_PAID";
    const applied = discountAmount > 0 ? discount! : null;

    await tx(async (s) => {
        // Must still be in exactly the state we read, or someone changed it first.
        const r = await BookingModel.updateOne(
            { id: b.id, bookingStatus: b.bookingStatus, paymentStatus: b.paymentStatus },
            {
                $set: {
                    discountAmount,
                    discountType: applied?.type ?? null,
                    discountValue: applied?.value ?? null,
                    vatAmount: vat,
                    total,
                    balanceAmount: balance,
                    paymentStatus,
                },
            },
            { session: s }
        );
        if (r.modifiedCount === 0) {
            throw new AppError("CHANGED", "This booking just changed. Refresh and try again.", 409);
        }
        await logAudit(
            user,
            {
                action: "DISCOUNT_UPDATED",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: {
                    discountType: applied?.type ?? "NONE",
                    discountValue: applied?.value ?? 0,
                    discount: discountAmount,
                    oldTotal: b.total,
                    newTotal: total,
                    oldBalance: b.balanceAmount,
                    newBalance: balance,
                    paidAtTheTime: paid,
                },
            },
            { session: s }
        );
    });

    return toAdminDto(await fresh(b), user, now);
}

/**
 * Add or change (or clear, with a null charge) the additional charge after the booking
 * was created — the same charge staff could previously only add in the walk-in form.
 * Use it when the charge was forgotten at the counter or the customer takes an extra
 * service once the slot is already booked. The charge is ADDED after the counter
 * discount (subtotal − discount + charge), VAT is worked out again on the result, and
 * the total, balance and payment status are recalculated from what the customer has
 * actually paid so far. The payable total can only go up (or back down when a charge
 * is cleared).
 */
export async function updateAdditionalCharge(
    user: ServerUser,
    code: string,
    charge: ExtraCharge | null,
    now: Date = new Date()
): Promise<AdminBookingDto> {
    const b = await findBookingForStaff(user, code);
    if (b.bookingStatus !== "CONFIRMED" && b.bookingStatus !== "CHECKED_IN") {
        throw new AppError("NOT_EDITABLE", "The additional charge can only be changed while the booking is Booked or Checked in.", 409);
    }
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "A payment is being processed. Try again shortly.", 409);
    }
    if (b.paymentStatus !== "PARTIALLY_PAID" && b.paymentStatus !== "PAID") {
        throw new AppError("NOT_EDITABLE", "The additional charge can only be changed on a booked or checked-in booking.", 409);
    }

    // Same rules as the walk-in form: whole taka, at least ৳1 when present, at most the cap.
    const chargeError = extraChargeError(charge);
    if (chargeError) {
        throw new AppError("INVALID_CHARGE", `Additional charge: ${chargeError}.`, 400, { additionalCharge: chargeError });
    }
    const chargeAmount = extraChargeAmount(charge);
    const reason = chargeAmount > 0 ? charge?.reason?.trim().slice(0, EXTRA_CHARGE_REASON_MAX) || null : null;
    const previousAmount =
        typeof b.additionalChargeAmount === "number" && b.additionalChargeAmount > 0 ? b.additionalChargeAmount : 0;

    // The counter discount stays on the booking: the charge is ADDED after the discount,
    // so the recomputed total keeps both. VAT follows the venue's snapshot rate and mode.
    const discountAmount = typeof b.discountAmount === "number" && b.discountAmount > 0 ? b.discountAmount : 0;
    const { vat, total } = vatTotals(
        b.subtotal - discountAmount + chargeAmount,
        b.vatRatePercentSnapshot ?? null,
        policies.vatMode
    );

    // What the customer has actually paid (successful payments only — the same sum the
    // panel shows). The new balance is the charged total minus that; a charge on a fully
    // paid booking puts it back to PARTIALLY_PAID so the balance can be collected.
    const paid = (await PaymentModel.find({ bookingId: b.id, status: "SUCCESS" }, { amount: 1 }).lean<{ amount: number }[]>()).reduce(
        (sum, p) => sum + p.amount,
        0
    );
    // Clearing or lowering a charge lowers the total: the same rule as a discount.
    assertStaffMayLowerTotal(user, b, total, paid, "additional charge", "additionalCharge");
    const balance = Math.max(0, total - paid);
    const paymentStatus = paid > 0 && total <= paid ? "PAID" : "PARTIALLY_PAID";

    await tx(async (s) => {
        // Must still be in exactly the state we read, or someone changed it first.
        const r = await BookingModel.updateOne(
            { id: b.id, bookingStatus: b.bookingStatus, paymentStatus: b.paymentStatus },
            {
                $set: {
                    additionalChargeAmount: chargeAmount,
                    additionalChargeReason: reason,
                    vatAmount: vat,
                    total,
                    balanceAmount: balance,
                    paymentStatus,
                },
            },
            { session: s }
        );
        if (r.modifiedCount === 0) {
            throw new AppError("CHANGED", "This booking just changed. Refresh and try again.", 409);
        }
        await logAudit(
            user,
            {
                action: "CHARGE_UPDATED",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: {
                    amount: chargeAmount,
                    reason: reason ?? "",
                    previousAmount,
                    oldTotal: b.total,
                    newTotal: total,
                    oldBalance: b.balanceAmount,
                    newBalance: balance,
                    paidAtTheTime: paid,
                },
            },
            { session: s }
        );
    });

    return toAdminDto(await fresh(b), user, now);
}

/**
 * Add or change (or clear, with a null note) the staff note after the booking was
 * created — the note staff could previously only type in the walk-in form.
 */
export async function updateNote(user: ServerUser, code: string, note: string | null, now: Date = new Date()): Promise<AdminBookingDto> {
    const b = await findBookingForStaff(user, code);
    if (b.bookingStatus !== "CONFIRMED" && b.bookingStatus !== "CHECKED_IN") {
        throw new AppError("NOT_EDITABLE", "The note can only be changed while the booking is Booked or Checked in.", 409);
    }
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "A payment is being processed. Try again shortly.", 409);
    }

    const trimmed = note?.trim().slice(0, WALKIN_NOTE_MAX) || null;

    await tx(async (s) => {
        const r = await BookingModel.updateOne(
            { id: b.id, bookingStatus: b.bookingStatus },
            { $set: { note: trimmed } },
            { session: s }
        );
        if (r.modifiedCount === 0) {
            throw new AppError("CHANGED", "This booking just changed. Refresh and try again.", 409);
        }
        await logAudit(
            user,
            {
                action: "NOTE_UPDATED",
                entityType: "BOOKING",
                entityId: b.bookingCode,
                branchId: b.branchId,
                meta: { note: trimmed ?? "", previousNote: b.note ?? "" },
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
    const received = (await PaymentModel.find({ bookingId: b.id, status: "SUCCESS" }, { amount: 1 }).lean<{ amount: number }[]>()).reduce(
        (sum, p) => sum + p.amount,
        0
    );
    // A walk-in booked with no advance (৳0) is PARTIALLY_PAID but holds no money:
    // cancelling it has nothing to refund.
    const moneyIn = (b.paymentStatus === "PARTIALLY_PAID" || b.paymentStatus === "PAID") && (received > 0 || b.advanceAmount > 0);

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

// Block (kind: MAINTENANCE or HELD, reason required) or unblock (block: false)
// one cell. HELD = manual hold for walk-ins / friends & family who pay at the
// venue; it shows as "Held" on /book just like an online hold. A customer's
// own online hold or a real booking is never touched.
export async function setBlock(
    user: ServerUser,
    input: { pitchId: string; cellStart: string; block: boolean; kind?: "MAINTENANCE" | "HELD"; reason?: string },
    now: Date = new Date()
) {
    const kind = input.kind ?? "MAINTENANCE";
    const pitch = getPitch(input.pitchId);
    if (!pitch) throw new AppError("NOT_FOUND", "Pitch not found.", 404);
    assertBranchAccess(user, pitch.branchId);

    const d = new Date(input.cellStart);
    if (Number.isNaN(d.getTime())) throw new AppError("INVALID_SLOT", "Invalid slot.", 400);
    const date = dhakaParts(d).date;
    const cell = (await getPitchAvailability(pitch.id, date, now, { allowStarted: true, fresh: true })).find(
        (c) => c.cellStart === d.toISOString()
    );
    if (!cell) throw new AppError("INVALID_SLOT", "That slot is not on this pitch's schedule.", 400);

    const meta = { pitch: pitch.name, date, start: cell.start, kind };
    const entityId = `${pitch.id}@${cell.cellStart}`;
    await connectDb();

    if (input.block) {
        if (cell.status === "PAST") throw new AppError("SLOT_PAST", "That slot has already ended.", 409);
        // Never touch a real booking or a customer's live online hold.
        const existing = await SlotClaimModel.findOne({ pitchId: pitch.id, cellStart: cell.cellStart })
            .lean<{ state: string; bookingId?: string; expiresAt?: string } | null>();
        const onlineHold =
            existing?.state === "HELD" &&
            !!existing.bookingId &&
            (!existing.expiresAt || new Date(existing.expiresAt) > now);
        if (existing?.state === "BOOKED" || onlineHold) {
            throw new AppError("SLOT_TAKEN", "That slot is booked or on hold for a customer.", 409);
        }
        await tx(async (s) => {
            if (existing) {
                // A staff claim already sits here (expired hold or the other kind):
                // flip it to the requested kind instead of failing on the unique index.
                // Only the exact claim checked above: if a customer replaced an expired
                // hold with a live one in the meantime, their hold is left alone.
                const r = await SlotClaimModel.updateOne(
                    {
                        pitchId: pitch.id,
                        cellStart: cell.cellStart,
                        state: existing.state,
                        bookingId: existing.bookingId ?? null,
                        expiresAt: existing.expiresAt ?? null,
                    },
                    { $set: { state: kind, reason: input.reason ?? null }, $unset: { bookingId: "", expiresAt: "" } },
                    { session: s }
                );
                if (r.matchedCount === 0) {
                    throw new AppError("SLOT_TAKEN", "That slot just changed. Refresh and try again.", 409);
                }
            } else {
                await insertClaims(pitch.id, [cell.cellStart], { state: kind, reason: input.reason }, now, s);
            }
            await logAudit(
                user,
                { action: "SLOT_BLOCKED", entityType: "SLOT", entityId, branchId: pitch.branchId, meta: { ...meta, reason: input.reason ?? null } },
                { session: s }
            );
        });
    } else {
        await tx(async (s) => {
            // Only staff claims (no bookingId) can be released here.
            const r = await SlotClaimModel.deleteOne(
                { pitchId: pitch.id, cellStart: cell.cellStart, state: { $in: ["MAINTENANCE", "HELD"] }, bookingId: null },
                { session: s }
            );
            if (r.deletedCount === 0) throw new AppError("NOT_FOUND", "This slot is not blocked.", 404);
            await logAudit(user, { action: "SLOT_UNBLOCKED", entityType: "SLOT", entityId, branchId: pitch.branchId, meta }, { session: s });
        });
    }
    // Committed: the board refresh and /book must see the new state right away.
    invalidateAvailability(pitch.id);
    return { ok: true };
}