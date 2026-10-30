// Booking lifecycle: validate -> quote -> acquire claims -> create pending booking.
// Price, status and availability are always decided here, never by the browser.
import "server-only";
import { randomInt, randomUUID } from "crypto";
import { branches } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays, dhakaParts, toHHMM, todayDhaka } from "@/lib/time";
import { AppError } from "@/server/http";
import { getPitch, getPitchAvailability } from "@/server/availability";
import { quote } from "@/server/pricing";
import { store } from "@/server/store";
import type { ServerUser } from "@/server/auth/session";
import type { Booking, BookingDto } from "@/types/booking";
import { logAudit } from "../audit";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const SETTLEABLE = ["NOT_STARTED", "FAILED", "CANCELLED"];

function newCode(): string {
    for (; ;) {
        let s = "";
        for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
        const code = `KT-${s}`;
        if (!store.bookings.some((b) => b.bookingCode === code)) return code;
    }
}

export function releaseClaims(bookingId: string) {
    store.claims = store.claims.filter((c) => c.bookingId !== bookingId);
}

/**
 * Mirrors the Mongo transaction in spec 8.3: delete expired HELD claims for the
 * target cells, then insert all. Any existing claim means "slot unavailable".
 * Synchronous, so atomic within one process. Mongo's unique index replaces it.
 */
function acquireClaims(pitchId: string, starts: string[], bookingId: string, expiresAt: Date, now: Date) {
    store.claims = store.claims.filter(
        (c) =>
            !(
                c.pitchId === pitchId &&
                starts.includes(c.cellStart) &&
                c.state === "HELD" &&
                c.expiresAt &&
                new Date(c.expiresAt) <= now
            )
    );

    if (store.claims.some((c) => c.pitchId === pitchId && starts.includes(c.cellStart))) {
        throw new AppError("SLOT_UNAVAILABLE", "Someone just took that slot. Pick another time.", 409);
    }

    for (const cellStart of starts) {
        store.claims.push({ pitchId, cellStart, state: "HELD", bookingId, expiresAt: expiresAt.toISOString() });
    }
}

export function validateSelection(pitchId: string, cellStarts: string[], now: Date = new Date()) {
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

    const today = todayDhaka(now);
    const date = dhakaParts(dates[0]).date;
    if (date < today || date > addDays(today, policies.bookingHorizonDays)) {
        throw new AppError("OUT_OF_RANGE", "Choose a date inside the booking window.", 400);
    }

    const cells = getPitchAvailability(pitchId, date, now);
    const picked = dates.map((d) => cells.find((c) => c.cellStart === d.toISOString()));
    if (picked.some((c) => !c)) {
        throw new AppError("INVALID_SLOT", "That slot is not on this pitch's schedule.", 400);
    }

    const step = policies.slotMinutes * 60_000;
    for (let i = 1; i < picked.length; i++) {
        const gap = new Date(picked[i]!.cellStart).getTime() - new Date(picked[i - 1]!.cellStart).getTime();
        if (gap !== step) throw new AppError("NOT_CONSECUTIVE", "Pick consecutive slots only.", 400);
    }

    if (picked.some((c) => c!.status !== "AVAILABLE")) {
        throw new AppError("SLOT_UNAVAILABLE", "Someone just took that slot. Pick another time.", 409);
    }

    return { pitch, branch, date, starts: dates };
}

export function quoteSelection(pitchId: string, cellStarts: string[]) {
    const v = validateSelection(pitchId, cellStarts);
    return quote(pitchId, v.starts);
}

/** Expired, unpaid holds become EXPIRED and free their cells. */
export function settle(b: Booking, now: Date) {
    if (
        b.bookingStatus === "PENDING_PAYMENT" &&
        SETTLEABLE.includes(b.paymentStatus) &&
        new Date(b.holdExpiresAt) <= now
    ) {
        b.bookingStatus = "EXPIRED";
        releaseClaims(b.id);
    }
}

export function createBooking(
    user: ServerUser,
    input: { pitchId: string; cellStarts: string[]; phone: string },
    now: Date = new Date()
): BookingDto {
    // One live unpaid hold per customer: a new Continue replaces the old one.
    store.bookings = store.bookings.filter((b) => {
        const stale =
            b.customerId === user.id && b.bookingStatus === "PENDING_PAYMENT" && b.paymentStatus === "NOT_STARTED";
        if (stale) releaseClaims(b.id);
        return !stale;
    });

    const v = validateSelection(input.pitchId, input.cellStarts, now);
    const q = quote(input.pitchId, v.starts);

    const id = randomUUID();
    const holdExpiresAt = new Date(now.getTime() + policies.holdMinutes * 60_000);
    const startStrings = v.starts.map((d) => d.toISOString());

    acquireClaims(input.pitchId, startStrings, id, holdExpiresAt, now);

    const endAt = new Date(v.starts[v.starts.length - 1].getTime() + policies.slotMinutes * 60_000);

    const booking: Booking = {
        id,
        bookingCode: newCode(),
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
    store.bookings.push(booking);

    logAudit(user, {
        action: "BOOKING_CREATED",
        entityType: "BOOKING",
        entityId: booking.bookingCode,
        branchId: booking.branchId,
        meta: {
            pitch: v.pitch.name,
            date: v.date,
            slots: booking.slotCount,
            total: q.total,
            advance: q.advance,
        },
    });

    return toDto(booking, now);
}

export function findOwned(code: string, user: ServerUser): Booking {
    const b = store.bookings.find((x) => x.bookingCode === code);
    // Same message for "missing" and "not yours" so codes cannot be probed.
    if (!b || (b.customerId !== user.id && user.role !== "SUPER_ADMIN")) {
        throw new AppError("NOT_FOUND", "Booking not found.", 404);
    }
    return b;
}

export function getBookingForUser(code: string, user: ServerUser, now: Date = new Date()): BookingDto {
    const b = findOwned(code, user);
    settle(b, now);
    return toDto(b, now);
}

/** Customer leaves the payment step before paying: free the cells. */
export function releaseHold(code: string, user: ServerUser, now: Date = new Date()) {
    const b = findOwned(code, user);
    settle(b, now);
    if (b.bookingStatus !== "PENDING_PAYMENT") return;
    if (b.paymentStatus === "PENDING") {
        throw new AppError("PAYMENT_IN_PROGRESS", "Your payment is being processed.", 409);
    }
    releaseClaims(b.id);
    store.bookings = store.bookings.filter((x) => x.id !== b.id);
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