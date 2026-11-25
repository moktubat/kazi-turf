// Staff Desk board: same availability function as /book, plus who holds each cell.
import "server-only";
import { branches } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays, dhakaToUtc } from "@/lib/time";
import { BookingModel, ChangeRequestModel, PaymentModel, SlotClaimModel } from "@/models";
import { assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { getBranchPitches, pitchCellsFromClaims } from "@/server/availability";
import { settleExpired } from "@/server/bookings/expire";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { BoardCell, BoardResponse } from "@/types/admin";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { SlotClaim } from "@/types";
import { todayDhaka } from "@/lib/time.server";

// Bookings that count as "the day's sales" (cancelled/expired never do).
const SALES_STATUSES = ["CONFIRMED", "CHECKED_IN", "COMPLETED"] as const;

export async function getBoard(
    user: ServerUser,
    branchId: string,
    date: string,
    now: Date = new Date()
): Promise<BoardResponse> {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) throw new AppError("NOT_FOUND", "Venue not found.", 404);
    assertBranchAccess(user, branch.id);

    const today = await todayDhaka(now);
    if (date < addDays(today, -90) || date > addDays(today, policies.bookingHorizonDays)) {
        throw new AppError("OUT_OF_RANGE", "That date is outside the range you can view.", 400);
    }

    await connectDb();
    await settleExpired({ branchId: branch.id }, now);

    const from = dhakaToUtc(date, 0).toISOString();
    const to = dhakaToUtc(addDays(date, 1), 0).toISOString();
    const list = await getBranchPitches(branch.id);
    const claims = await SlotClaimModel.find({
        pitchId: { $in: list.map((p) => p.id) },
        cellStart: { $gte: from, $lt: to },
    }).lean<SlotClaim[]>();

    const claimBy = new Map(claims.map((c) => [`${c.pitchId}|${c.cellStart}`, c]));
    const bookingIds = [...new Set(claims.map((c) => c.bookingId).filter(Boolean))];

    // All bookings of the day (any status) — their ids drive the payment sums below.
    const dayDocs = await BookingModel.find(
        { branchId: branch.id, date },
        { id: 1, bookingStatus: 1, total: 1 }
    ).lean<Pick<Booking, "id" | "bookingStatus" | "total">[]>();
    const dayIds = dayDocs.map((b) => b.id);

    const [bookingDocs, dayPayments, cashDocs, openReqs] = await Promise.all([
        BookingModel.find({ id: { $in: bookingIds } }).lean(),
        // Every successful payment on the day's bookings, whenever it was paid and by
        // whichever channel (cash at the counter, or bKash online days earlier).
        PaymentModel.find({ bookingId: { $in: dayIds }, status: "SUCCESS" }).lean<Payment[]>(),
        // Kept for the API's cashCollected: cash actually received today.
        PaymentModel.find({ provider: "CASH", status: "SUCCESS", verifiedAt: { $gte: from, $lt: to } }).lean<Payment[]>(),
        ChangeRequestModel.find({ status: "OPEN" }, { bookingCode: 1 }).lean<{ bookingCode: string }[]>(),
    ]);
    const byId = new Map(plainAll<Booking>(bookingDocs).map((b) => [b.id, b]));

    const cashIds = [...new Set(cashDocs.map((p) => p.bookingId))];
    const mine = new Set(
        (await BookingModel.find({ id: { $in: cashIds }, branchId: branch.id }, { id: 1 }).lean<{ id: string }[]>()).map((b) => b.id)
    );
    const cash = cashDocs.filter((p) => mine.has(p.bookingId)).reduce((s, p) => s + p.amount, 0);
    const openRequests = openReqs.length
        ? await BookingModel.countDocuments({ bookingCode: { $in: openReqs.map((r) => r.bookingCode) }, branchId: branch.id })
        : 0;

    // The money quartet, per booking of the day:
    //   totalSales       = sum of totals of the day's active bookings
    //   collected        = everything actually received on those bookings (advance + balances)
    //   advanceCollected = every advance payment on those bookings, whenever/wherever paid
    //   pendingCash      = per active booking: total − everything paid so far on it
    const isSale = (status: string) => (SALES_STATUSES as readonly string[]).includes(status);
    const salesIds = new Set(dayDocs.filter((b) => isSale(b.bookingStatus)).map((b) => b.id));
    const paidById = new Map<string, number>();
    for (const p of dayPayments) {
        paidById.set(p.bookingId, (paidById.get(p.bookingId) ?? 0) + p.amount);
    }

    const totalSales = dayDocs.filter((b) => salesIds.has(b.id)).reduce((s, b) => s + b.total, 0);
    const collected = dayPayments
        .filter((p) => salesIds.has(p.bookingId))
        .reduce((s, p) => s + p.amount, 0);
    const advanceCollected = dayPayments
        .filter((p) => p.kind === "ADVANCE" && salesIds.has(p.bookingId))
        .reduce((s, p) => s + p.amount, 0);
    const pendingCash = dayDocs
        .filter((b) => salesIds.has(b.id))
        .reduce((s, b) => s + Math.max(0, b.total - (paidById.get(b.id) ?? 0)), 0);

    const pitches = await Promise.all(
        list.map(async (p) => {
            // Same day, same claims the board already loaded: no second query per field.
            const cells: BoardCell[] = pitchCellsFromClaims(p.id, date, claims, now, { allowStarted: true }).map((c) => {
                const claim = claimBy.get(`${p.id}|${c.cellStart}`);
                const bk = claim?.bookingId ? byId.get(claim.bookingId) : undefined;
                return {
                    ...c,
                    // Show the note on staff blocks — maintenance and manual holds (no booking attached).
                    reason:
                        claim && (claim.state === "MAINTENANCE" || (claim.state === "HELD" && !claim.bookingId))
                            ? claim.reason
                            : undefined,
                    booking:
                        bk && c.status !== "AVAILABLE"
                            ? {
                                code: bk.bookingCode,
                                customerName: bk.customerName,
                                bookingStatus: bk.bookingStatus,
                                paymentStatus: bk.paymentStatus,
                                balanceDue: bk.paymentStatus === "PARTIALLY_PAID" ? bk.balanceAmount : 0,
                            }
                            : undefined,
                };
            });
            return { id: p.id, name: p.name, sport: p.sport, format: p.format, maxConsecutiveSlots: p.maxConsecutiveSlots, cells };
        })
    );

    return {
        branchId: branch.id,
        branchName: branch.name,
        date,
        updatedAt: now.toISOString(),
        pitches,
        stats: {
            arrivalsPending: dayDocs.filter((b) => b.bookingStatus === "CONFIRMED").length,
            checkedIn: dayDocs.filter((b) => b.bookingStatus === "CHECKED_IN").length,
            // Checked in · Due: playing (or played) with money still owed on the booking.
            checkedInDue: dayDocs.filter((b) => b.bookingStatus === "CHECKED_IN" && b.total - (paidById.get(b.id) ?? 0) > 0).length,
            checkedOut: dayDocs.filter((b) => b.bookingStatus === "COMPLETED").length,
            cashCollected: cash,
            totalSales,
            collected,
            advanceCollected,
            pendingCash,
            openRequests,
        },
    };
}