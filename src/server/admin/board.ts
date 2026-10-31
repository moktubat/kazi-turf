// Staff Desk board: same availability function as /book, plus who holds each cell.
import "server-only";
import { branches } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays, dhakaToUtc, todayDhaka } from "@/lib/time";
import { BookingModel, ChangeRequestModel, PaymentModel, SlotClaimModel } from "@/models";
import { assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { getBranchPitches, getPitchAvailability } from "@/server/availability";
import { settleExpired } from "@/server/bookings/expire";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { BoardCell, BoardResponse } from "@/types/admin";
import type { Booking } from "@/types/booking";
import { SlotClaim } from "@/types";

export async function getBoard(
    user: ServerUser,
    branchId: string,
    date: string,
    now: Date = new Date()
): Promise<BoardResponse> {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch || branch.status === "COMING_SOON") throw new AppError("NOT_FOUND", "Branch not found.", 404);
    assertBranchAccess(user, branch.id);

    const today = await todayDhaka(now);
    if (date < addDays(today, -90) || date > addDays(today, policies.bookingHorizonDays)) {
        throw new AppError("OUT_OF_RANGE", "That date is outside the range you can view.", 400);
    }

    await connectDb();
    await settleExpired({ branchId: branch.id }, now);

    const from = dhakaToUtc(date, 0).toISOString();
    const to = dhakaToUtc(addDays(date, 1), 0).toISOString();
    const list = getBranchPitches(branch.id);

    const claims = await SlotClaimModel.find({
        pitchId: { $in: list.map((p) => p.id) },
        cellStart: { $gte: from, $lt: to },
    }).lean<SlotClaim[]>();

    const claimBy = new Map(claims.map((c) => [`${c.pitchId}|${c.cellStart}`, c]));
    const bookingIds = [...new Set(claims.map((c) => c.bookingId).filter(Boolean))];

    const [bookingDocs, dayDocs, cashDocs, openReqs] = await Promise.all([
        BookingModel.find({ id: { $in: bookingIds } }).lean(),
        BookingModel.find({ branchId: branch.id, date }, { bookingStatus: 1 }).lean<any[]>(),
        PaymentModel.find({ provider: "CASH", status: "SUCCESS", verifiedAt: { $gte: from, $lt: to } }).lean<any[]>(),
        ChangeRequestModel.find({ status: "OPEN" }, { bookingCode: 1 }).lean<any[]>(),
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

    const pitches = await Promise.all(
        list.map(async (p) => {
            const cells: BoardCell[] = (await getPitchAvailability(p.id, date, now, { allowStarted: true })).map((c) => {
                const claim = claimBy.get(`${p.id}|${c.cellStart}`);
                const bk = claim?.bookingId ? byId.get(claim.bookingId) : undefined;
                return {
                    ...c,
                    reason: claim?.state === "MAINTENANCE" ? claim.reason : undefined,
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
            cashCollected: cash,
            openRequests,
        },
    };
}