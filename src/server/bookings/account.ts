// Customer-facing booking lists and change requests.
import "server-only";
import { randomUUID } from "crypto";
import { BookingModel, ChangeRequestModel, PaymentModel } from "@/models";
import { logAudit } from "@/server/audit";
import type { ServerUser } from "@/server/auth/session";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { AccountBookingDto, ChangeKind, ChangeRequestInfo } from "@/types/account";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { findBookingByCode, settle, toDto } from "./index";

export async function listAccountBookings(user: ServerUser, now: Date = new Date()) {
    await connectDb();
    const raw = plainAll<Booking>(await BookingModel.find({ customerId: user.id }).lean());
    const mine = await Promise.all(raw.map((b) => settle(b, now))); // expired holds become EXPIRED

    const codes = mine.map((b) => b.bookingCode);
    const ids = mine.map((b) => b.id);
    const [requests, pays] = await Promise.all([
        ChangeRequestModel.find({ bookingCode: { $in: codes }, status: "OPEN" }).lean<any[]>(),
        PaymentModel.find({ bookingId: { $in: ids }, provider: "BKASH", status: "SUCCESS" }).lean<any[]>(),
    ]);
    const reqBy = new Map(requests.map((r) => [r.bookingCode, r]));
    const refBy = new Map((plainAll<Payment>(pays)).map((p) => [p.bookingId, p.providerTxnId ?? null]));

    const upcoming: AccountBookingDto[] = [];
    const history: AccountBookingDto[] = [];

    for (const b of mine) {
        const open = reqBy.get(b.bookingCode);
        const dto: AccountBookingDto = {
            ...toDto(b, now),
            paymentReference: refBy.get(b.id) ?? null,
            changeRequest: open ? { kind: open.kind, status: open.status, createdAt: open.createdAt } : null,
            canRequestChange: b.bookingStatus === "CONFIRMED" && new Date(b.startAt) > now && !open,
        };
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

export async function requestChange(
    user: ServerUser,
    code: string,
    input: { kind: ChangeKind; reason: string },
    now: Date = new Date()
): Promise<ChangeRequestInfo> {
    const b = await findBookingByCode(code);
    if (!b || b.customerId !== user.id) throw new AppError("NOT_FOUND", "Booking not found.", 404);

    if (b.bookingStatus !== "CONFIRMED" || new Date(b.startAt) <= now) {
        throw new AppError("NOT_ELIGIBLE", "This booking can no longer be changed online. Please contact the venue.", 409);
    }
    if (await ChangeRequestModel.exists({ bookingCode: code, status: "OPEN" })) {
        throw new AppError("ALREADY_REQUESTED", "You already have an open request for this booking.", 409);
    }

    const r = {
        id: randomUUID(),
        bookingCode: code,
        customerId: user.id,
        kind: input.kind,
        reason: input.reason,
        status: "OPEN" as const,
        createdAt: now.toISOString(),
    };
    await ChangeRequestModel.create(r);
    await logAudit(user, {
        action: "CHANGE_REQUESTED",
        entityType: "BOOKING",
        entityId: code,
        branchId: b.branchId,
        meta: { kind: input.kind },
    });
    return { kind: r.kind, status: r.status, createdAt: r.createdAt };
}