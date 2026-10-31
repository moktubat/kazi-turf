// Booking lifecycle: validate -> quote -> acquire claims + create pending booking (one transaction).
// Price, status and availability are always decided here, never by the browser.
import "server-only";
import { randomInt, randomUUID } from "crypto";
import { branches } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays, dhakaParts, toHHMM } from "@/lib/time";
import { BookingModel } from "@/models";
import { logAudit } from "@/server/audit";
import type { ServerUser } from "@/server/auth/session";
import { getPitch, getPitchAvailability } from "@/server/availability";
import { insertClaims, releaseClaims } from "@/server/claims";
import { connectDb, tx } from "@/server/db/connect";
import { plain } from "@/server/db/util";
import { AppError } from "@/server/http";
import { quote } from "@/server/pricing";
import type { Booking, BookingDto } from "@/types/booking";
import { todayDhaka } from "@/lib/time.server";

export { releaseClaims };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const CODE_RE = /^KT-[A-HJ-NP-Z2-9]{6}$/;
export const SETTLEABLE = ["NOT_STARTED", "FAILED", "CANCELLED"];

/** Random, non-guessable. The unique bookingCode index is the backstop against a collision. */
export async function newCode(): Promise<string> {
    await connectDb();
    for (; ;) {
        let s = "";
        for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
        const code = `KT-${s}`;
        if (!(await BookingModel.exists({ bookingCode: code }))) return code;
    }
}

export async function findBookingByCode(code: string): Promise<Booking | null> {
    if (!CODE_RE.test(code)) return null;
    await connectDb();
    const d = await BookingModel.findOne({ bookingCode: code }).lean();
    return d ? plain<Booking>(d) : null;
}

export async function findBookingById(id: string): Promise<Booking | null> {
    await connectDb();
    const d = await BookingModel.findOne({ id }).lean();
    return d ? plain<Booking>(d) : null;
}

/** Expired, unpaid holds become EXPIRED and free their cells. Returns the up-to-date booking. */
export async function settle(b: Booking, now: Date = new Date()): Promise<Booking> {
    if (
        b.bookingStatus !== "PENDING_PAYMENT" ||
        !SETTLEABLE.includes(b.paymentStatus) ||
        new Date(b.holdExpiresAt) > now
    ) {
        return b;
    }
    const expired = await tx(async (s) => {
        const r = await BookingModel.updateOne(
            {
                id: b.id,
                bookingStatus: "PENDING_PAYMENT",
                paymentStatus: { $in: SETTLEABLE },
                holdExpiresAt: { $lte: now.toISOString() },
            },
            { $set: { bookingStatus: "EXPIRED" } },
            { session: s }
        );
        if (r.modifiedCount > 0) await releaseClaims(b.id, s);
        return r.modifiedCount > 0;
    });
    if (expired) return { ...b, bookingStatus: "EXPIRED" };
    return (await findBookingById(b.id)) ?? b; // someone changed it first (for example a payment started)
}

export async function validateSelection(pitchId: string, cellStarts: string[], now: Date = new Date()) {
    const pitch = getPitch(pitchId);
    if (!pitch || pitch.status !== "ACTIVE") {
        throw new AppError("PITCH_NOT_FOUND", "This pitch is not available.", 404);
    }
    const branch = branches.find((b) => b.id === pitch.branchId);
    if (!branch || branch.status !== "ACTIVE") {
        throw new AppError("BRANCH_DISABLED", "This branch is not taking bookings right now.", 409);
    }

    const unique = [...new Set(cellStarts)];
    if (unique.length === 0) throw new AppError("VALIDATION", "Pick a slot first.", 400);
    if (unique.length > pitch.maxConsecutiveSlots) {
        throw new AppError("TOO_MANY_SLOTS", `You can book up to ${pitch.maxConsecutiveSlots} consecutive slots.`, 400);
    }

    const dates = unique.map((iso) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) throw new AppError("INVALID_SLOT", "Invalid slot.", 400);
        return d;
    });
    dates.sort((a, b) => a.getTime() - b.getTime());

    const today = await todayDhaka(now);
    const date = dhakaParts(dates[0]).date;
    if (date < today || date > addDays(today, policies.bookingHorizonDays)) {
        throw new AppError("OUT_OF_RANGE", "Choose a date inside the booking window.", 400);
    }

    const cells = await getPitchAvailability(pitchId, date, now);
    const picked = dates.map((d) => cells.find((c) => c.cellStart === d.toISOString()));
    if (picked.some((c) => !c)) {
        throw new AppError("INVALID_SLOT", "That slot is not on this pitch's schedule.", 400);
    }

    const step = policies.slotMinutes * 60_000;
    for (let i = 1; i < picked.length; i++) {
        const gap = new Date(picked[i]!.cellStart).getTime() - new Date(picked[i - 1]!.cellStart).getTime();
        if (gap !== step) throw new AppError("NOT_CONSECUTIVE", "Pick consecutive slots only.", 400);
    }

    // Advisory check for a clear message. The unique index inside the transaction is the real guard.
    if (picked.some((c) => c!.status !== "AVAILABLE")) {
        throw new AppError("SLOT_UNAVAILABLE", "Someone just took that slot. Pick another time.", 409);
    }

    return { pitch, branch, date, starts: dates };
}

export async function quoteSelection(pitchId: string, cellStarts: string[]) {
    const v = await validateSelection(pitchId, cellStarts);
    return quote(pitchId, v.starts);
}

/** One live unpaid hold per customer: a new Continue replaces the old one. */
async function dropStaleHolds(userId: string) {
    await tx(async (s) => {
        const live = await BookingModel.find(
            { customerId: userId, bookingStatus: "PENDING_PAYMENT", paymentStatus: "NOT_STARTED" },
            { id: 1 }
        )
            .session(s)
            .lean<{ id: string }[]>();
        if (live.length === 0) return;
        const ids = live.map((x) => x.id);
        await releaseClaims(ids, s);
        await BookingModel.deleteMany({ id: { $in: ids } }, { session: s });
    });
}

export async function createBooking(
    user: ServerUser,
    input: { pitchId: string; cellStarts: string[]; phone: string },
    now: Date = new Date()
): Promise<BookingDto> {
    await dropStaleHolds(user.id);

    const v = await validateSelection(input.pitchId, input.cellStarts, now);
    const q = quote(input.pitchId, v.starts);

    const id = randomUUID();
    const holdExpiresAt = new Date(now.getTime() + policies.holdMinutes * 60_000);
    const startStrings = v.starts.map((d) => d.toISOString());
    const endAt = new Date(v.starts[v.starts.length - 1].getTime() + policies.slotMinutes * 60_000);

    const booking: Booking = {
        id,
        bookingCode: await newCode(),
        customerId: user.id,
        customerName: user.name,
        phone: input.phone,
        branchId: v.branch.id,
        pitchId: v.pitch.id,
        date: v.date,
        startAt: startStrings[0],
        endAt: endAt.toISOString(),
        cellStarts: startStrings,
        slotCount: startStrings.length,
        bookingStatus: "PENDING_PAYMENT",
        paymentStatus: "NOT_STARTED",
        subtotal: q.subtotal,
        vatAmount: q.vat,
        total: q.total,
        advanceAmount: q.advance,
        balanceAmount: q.balance,
        advancePercentSnapshot: q.advancePercent,
        vatRatePercentSnapshot: q.vatRatePercent,
        source: "online",
        holdExpiresAt: holdExpiresAt.toISOString(),
        createdAt: now.toISOString(),
    };

    // Claims, booking and audit entry succeed or fail together.
    await tx(async (s) => {
        await insertClaims(
            input.pitchId,
            startStrings,
            { state: "HELD", bookingId: id, expiresAt: holdExpiresAt.toISOString() },
            now,
            s
        );
        await BookingModel.create([booking], { session: s });
        await logAudit(
            user,
            {
                action: "BOOKING_CREATED",
                entityType: "BOOKING",
                entityId: booking.bookingCode,
                branchId: booking.branchId,
                meta: { pitch: v.pitch.name, date: v.date, slots: booking.slotCount, total: q.total, advance: q.advance },
            },
            { session: s }
        );
    });

    return toDto(booking, now);
}

export async function findOwned(code: string, user: ServerUser): Promise<Booking> {
    const b = await findBookingByCode(code);
    // Same message for "missing" and "not yours" so codes cannot be probed.
    if (!b || (b.customerId !== user.id && user.role !== "SUPER_ADMIN")) {
        throw new AppError("NOT_FOUND", "Booking not found.", 404);
    }
    return b;
}

export async function getBookingForUser(code: string, user: ServerUser, now: Date = new Date()): Promise<BookingDto> {
    const b = await settle(await findOwned(code, user), now);
    return toDto(b, now);
}

/** Customer leaves the payment step before paying: free the cells. */
export async function releaseHold(code: string, user: ServerUser, now: Date = new Date()) {
    const b = await settle(await findOwned(code, user), now);
    if (b.bookingStatus !== "PENDING_PAYMENT") return;
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "Your payment is being processed.", 409);
    }
    const removed = await tx(async (s) => {
        // Conditional: if a payment started in the meantime, nothing is deleted.
        const r = await BookingModel.deleteOne(
            { id: b.id, bookingStatus: "PENDING_PAYMENT", paymentStatus: { $ne: "PENDING" } },
            { session: s }
        );
        if (r.deletedCount > 0) await releaseClaims(b.id, s);
        return r.deletedCount > 0;
    });
    if (!removed) throw new AppError("PAYMENT_IN_PROGRESS", "Your payment is being processed.", 409);
}

export function toDto(b: Booking, now: Date = new Date()): BookingDto {
    const branch = branches.find((x) => x.id === b.branchId);
    const pitch = getPitch(b.pitchId);
    const paidAdvance = b.paymentStatus === "PARTIALLY_PAID" || b.paymentStatus === "PAID";

    return {
        code: b.bookingCode,
        bookingStatus: b.bookingStatus,
        paymentStatus: b.paymentStatus,
        branchId: b.branchId,
        branchName: branch?.name ?? "",
        branchAddress: branch?.address ?? "",
        branchMapUrl: branch?.mapUrl ?? "",
        branchPhone: branch?.phone ?? "",
        pitchId: b.pitchId,
        pitchName: pitch?.name ?? "",
        sport: pitch?.sport ?? "",
        date: b.date,
        start: toHHMM(dhakaParts(new Date(b.startAt)).minutes),
        end: toHHMM(dhakaParts(new Date(b.endAt)).minutes),
        startAt: b.startAt,
        endAt: b.endAt,
        slotCount: b.slotCount,
        subtotal: b.subtotal,
        vatAmount: b.vatAmount,
        vatRatePercent: b.vatRatePercentSnapshot,
        total: b.total,
        advanceAmount: b.advanceAmount,
        advancePaid: paidAdvance ? b.advanceAmount : 0,
        balanceAmount: b.balanceAmount,
        balanceDue: b.paymentStatus === "PARTIALLY_PAID" ? b.balanceAmount : 0,
        holdExpiresAt: b.holdExpiresAt,
        holdActive: b.bookingStatus === "PENDING_PAYMENT" && new Date(b.holdExpiresAt) > now,
        serverNow: now.toISOString(),
        checkInOpensMinutes: policies.checkInOpensMinutesBefore,
    };
}