// Staff Desk board: same availability function as /book, plus who holds each cell.
import "server-only";
import { branches } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays, dhakaParts, todayDhaka } from "@/lib/time";
import { getBranchPitches, getPitchAvailability } from "@/server/availability";
import { assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { settle } from "@/server/bookings";
import { AppError } from "@/server/http";
import { store } from "@/server/store";
import type { BoardCell, BoardResponse } from "@/types/admin";

export function getBoard(user: ServerUser, branchId: string, date: string, now: Date = new Date()): BoardResponse {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch || branch.status === "COMING_SOON") throw new AppError("NOT_FOUND", "Branch not found.", 404);
    assertBranchAccess(user, branch.id);

    const today = todayDhaka(now);
    if (date < addDays(today, -90) || date > addDays(today, policies.bookingHorizonDays)) {
        throw new AppError("OUT_OF_RANGE", "That date is outside the range you can view.", 400);
    }

    const here = store.bookings.filter((b) => b.branchId === branch.id);
    for (const b of here) settle(b, now); // free expired holds before reading claims
    const byId = new Map(here.map((b) => [b.id, b]));

    const pitches = getBranchPitches(branch.id).map((p) => {
        const claimByCell = new Map(store.claims.filter((c) => c.pitchId === p.id).map((c) => [c.cellStart, c]));
        const cells: BoardCell[] = getPitchAvailability(p.id, date, now, { allowStarted: true }).map((c) => {
            const claim = claimByCell.get(c.cellStart);
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
        return {
            id: p.id,
            name: p.name,
            sport: p.sport,
            format: p.format,
            maxConsecutiveSlots: p.maxConsecutiveSlots,
            cells,
        };
    });

    const day = here.filter((b) => b.date === date);
    const codes = new Set(here.map((b) => b.bookingCode));
    const ids = new Set(here.map((b) => b.id));
    const cash = store.payments
        .filter(
            (p) =>
                p.provider === "CASH" &&
                p.status === "SUCCESS" &&
                ids.has(p.bookingId) &&
                dhakaParts(new Date(p.verifiedAt ?? p.createdAt)).date === date
        )
        .reduce((s, p) => s + p.amount, 0);

    return {
        branchId: branch.id,
        branchName: branch.name,
        date,
        updatedAt: now.toISOString(),
        pitches,
        stats: {
            arrivalsPending: day.filter((b) => b.bookingStatus === "CONFIRMED").length,
            checkedIn: day.filter((b) => b.bookingStatus === "CHECKED_IN").length,
            cashCollected: cash,
            openRequests: store.changeRequests.filter((r) => r.status === "OPEN" && codes.has(r.bookingCode)).length,
        },
    };
}