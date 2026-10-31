// A walk-in is a confirmed counter booking. Claims, booking, cash payment and audit entry
// are written in ONE transaction: all succeed or none do.
import "server-only";
import { randomUUID } from "crypto";
import { branches } from "@/data/branches";
import { policies } from "@/data/site";
import { formatBDT } from "@/lib/format";
import { addDays, dhakaParts } from "@/lib/time";
import { BookingModel, PaymentModel, UserModel } from "@/models";
import { logAudit } from "@/server/audit";
import { assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { getPitch, getPitchAvailability } from "@/server/availability";
import { newCode } from "@/server/bookings";
import { insertClaims } from "@/server/claims";
import { connectDb, tx } from "@/server/db/connect";
import { AppError } from "@/server/http";
import { quote } from "@/server/pricing";
import type { AdminBookingDto } from "@/types/admin";
import type { Booking } from "@/types/booking";
import { toAdminDto } from "./dto";
import { todayDhaka } from "@/lib/time.server";

/** Walk-in rules: staff may book a slot already in progress; everything else matches /book. */
export async function validateWalkIn(user: ServerUser, pitchId: string, cellStarts: string[], now: Date) {
    const pitch = getPitch(pitchId);
    if (!pitch || pitch.status !== "ACTIVE") throw new AppError("PITCH_NOT_FOUND", "This pitch is not available.", 404);
    assertBranchAccess(user, pitch.branchId);

    const branch = branches.find((b) => b.id === pitch.branchId);
    if (!branch || branch.status !== "ACTIVE") {
        throw new AppError("BRANCH_DISABLED", "This branch is not taking new bookings.", 409);
    }

    const unique = [...new Set(cellStarts)];
    if (unique.length === 0) throw new AppError("VALIDATION", "Pick a slot first.", 400);
    if (unique.length > pitch.maxConsecutiveSlots) {
        throw new AppError("TOO_MANY_SLOTS", `Up to ${pitch.maxConsecutiveSlots} consecutive slots.`, 400);
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

    const cells = await getPitchAvailability(pitchId, date, now, { allowStarted: true });
    const picked = dates.map((d) => cells.find((c) => c.cellStart === d.toISOString()));
    if (picked.some((c) => !c)) throw new AppError("INVALID_SLOT", "That slot is not on this pitch's schedule.", 400);

    const step = policies.slotMinutes * 60_000;
    for (let i = 1; i < picked.length; i++) {
        const gap = new Date(picked[i]!.cellStart).getTime() - new Date(picked[i - 1]!.cellStart).getTime();
        if (gap !== step) throw new AppError("NOT_CONSECUTIVE", "Pick consecutive slots only.", 400);
    }
    // Advisory check for a clear message. The unique index inside the transaction is the real guard.
    if (picked.some((c) => c!.status !== "AVAILABLE")) {
        throw new AppError("SLOT_UNAVAILABLE", "That slot is no longer available. Refresh the board.", 409);
    }

    return { pitch, branch, date, starts: dates };
}

export async function quoteWalkIn(user: ServerUser, pitchId: string, cellStarts: string[], now: Date = new Date()) {
    const v = await validateWalkIn(user, pitchId, cellStarts, now);
    return quote(pitchId, v.starts);
}

/** Registered customers only (never staff). Returns the name, nothing else. */
export async function findCustomerName(phone: string): Promise<string | null> {
    await connectDb();
    const u = await UserModel.findOne({ role: "CUSTOMER", status: "ACTIVE", phone }, { name: 1 }).lean<{ name: string }>();
    return u?.name ?? null;
}

export async function createWalkIn(
    user: ServerUser,
    input: { pitchId: string; cellStarts: string[]; phone: string; name?: string; cashReceived: number },
    now: Date = new Date()
): Promise<AdminBookingDto> {
    const v = await validateWalkIn(user, input.pitchId, input.cellStarts, now);
    const q = quote(input.pitchId, v.starts);

    if (input.cashReceived < q.advance || input.cashReceived > q.total) {
        throw new AppError(
            "INVALID_AMOUNT",
            `Cash received must be between ${formatBDT(q.advance)} and ${formatBDT(q.total)}.`,
            400,
            { cashReceived: `Between ${formatBDT(q.advance)} and ${formatBDT(q.total)}` }
        );
    }

    // Link to a registered customer when the phone matches, otherwise keep a counter-only record.
    const existing = await UserModel.findOne(
        { role: "CUSTOMER", status: "ACTIVE", phone: input.phone },
        { id: 1, name: 1 }
    ).lean<{ id: string; name: string }>();
    const customerName = existing?.name ?? input.name?.trim();
    if (!customerName || customerName.length < 2) {
        throw new AppError("VALIDATION", "Enter the customer's name.", 400, { name: "Enter the customer's name" });
    }

    const id = randomUUID();
    const startStrings = v.starts.map((d) => d.toISOString());
    const endAt = new Date(v.starts[v.starts.length - 1].getTime() + policies.slotMinutes * 60_000);
    const paid = input.cashReceived;

    const booking: Booking = {
        id,
        bookingCode: await newCode(),
        customerId: existing?.id ?? `walkin:${input.phone}`,
        customerName,
        phone: input.phone,
        branchId: v.branch.id,
        pitchId: v.pitch.id,
        date: v.date,
        startAt: startStrings[0],
        endAt: endAt.toISOString(),
        cellStarts: startStrings,
        slotCount: startStrings.length,
        bookingStatus: "CONFIRMED",
        paymentStatus: paid >= q.total ? "PAID" : "PARTIALLY_PAID",
        subtotal: q.subtotal,
        vatAmount: q.vat,
        total: q.total,
        advanceAmount: paid, // what was actually received at the counter
        balanceAmount: q.total - paid,
        advancePercentSnapshot: q.advancePercent,
        vatRatePercentSnapshot: q.vatRatePercent,
        source: "counter",
        holdExpiresAt: now.toISOString(),
        createdAt: now.toISOString(),
    };

    await tx(async (s) => {
        await insertClaims(input.pitchId, startStrings, { state: "BOOKED", bookingId: id }, now, s);
        await BookingModel.create([booking], { session: s });
        await PaymentModel.create(
            [
                {
                    id: randomUUID(),
                    bookingId: id,
                    provider: "CASH",
                    kind: "ADVANCE",
                    amount: paid,
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
            {
                action: "WALKIN_CREATED",
                entityType: "BOOKING",
                entityId: booking.bookingCode,
                branchId: booking.branchId,
                meta: { pitch: v.pitch.name, date: v.date, slots: booking.slotCount, total: q.total, cash: paid },
            },
            { session: s }
        );
    });

    return toAdminDto(booking, user, now);
}