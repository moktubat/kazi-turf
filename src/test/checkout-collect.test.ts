// Checked in → Checked out (COMPLETED), and collecting a balance after check-in or on a
// previous date. Checking out closes the booking with the payment complete and keeps its
// slots on the board; the desk's money stats then show it as fully collected.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import { getBoard } from "@/server/admin/board";
import { checkIn, checkOut, collectBalance, undoCheckOut } from "@/server/admin/operations";
import { getBookingDetail } from "@/server/admin/search";
import { createWalkIn, quoteWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import type { Booking } from "@/types/booking";
import { startDb, stopDb } from "./helpers";

const staff: ServerUser = { id: "staff-co", name: "Staff", role: "STAFF", phone: "01354490362", email: null, branchIds: ["bogura"], permissions: [] };
let DAY = "";
const cell = (h: number) => dhakaToUtc(DAY, h * 60).toISOString();

beforeAll(async () => {
    await startDb();
    DAY = addDays(await todayDhaka(new Date()), 2);
}, 180_000);
afterAll(stopDb);

async function bookedWithAdvance(pitchId: string, h: number) {
    const q = await quoteWalkIn(staff, pitchId, [cell(h)]);
    const b = await createWalkIn(staff, { pitchId, cellStarts: [cell(h)], phone: "01755556666", name: "Jitu", cashReceived: 500 });
    return { q, b };
}
const checkInNoCash = (code: string) => checkIn(staff, code, { identity: { method: "NAME" }, collectBalance: false });

describe("collect balance after check-in", () => {
    it("a checked-in booking with a balance can still collect it, and add a discount or charge", async () => {
        const { q, b } = await bookedWithAdvance("bogura-a", 12);
        const inside = await checkInNoCash(b.code);
        expect(inside).toMatchObject({ bookingStatus: "CHECKED_IN", paymentStatus: "PARTIALLY_PAID", balanceDue: q.total - 500 });
        expect(inside.can).toMatchObject({ collectBalance: true, editDiscount: true, editCharge: true, checkOut: true, undoCheckIn: true });

        const paid = await collectBalance(staff, b.code);
        expect(paid).toMatchObject({ bookingStatus: "CHECKED_IN", paymentStatus: "PAID", balanceDue: 0 });
        expect(paid.can.collectBalance).toBe(false); // nothing left to collect
        await expect(collectBalance(staff, b.code)).rejects.toMatchObject({ code: "ALREADY_PAID", status: 409 });
    });

    it("works on a previous date too (the customer played and paid later)", async () => {
        const { q, b } = await bookedWithAdvance("bogura-b", 12);
        await checkInNoCash(b.code);
        // Move the game into the past: yesterday, already over.
        const y = dhakaToUtc(addDays(DAY, -3), 18 * 60);
        await BookingModel.updateOne(
            { bookingCode: b.code },
            { $set: { date: addDays(DAY, -3), startAt: y.toISOString(), endAt: new Date(y.getTime() + 90 * 60_000).toISOString() } }
        );
        const { booking } = await getBookingDetail(staff, b.code);
        expect(booking.can.collectBalance).toBe(true);
        const after = await collectBalance(staff, b.code);
        expect(after).toMatchObject({ paymentStatus: "PAID", balanceDue: 0 });
        expect(after.payments.map((p) => [p.kind, p.amount])).toEqual([["ADVANCE", 500], ["BALANCE", q.total - 500]]);
    });
});

describe("check out", () => {
    it("closes the booking: balance collected, status Checked out, slots kept, desk shows it fully collected", async () => {
        const { q, b } = await bookedWithAdvance("bogura-c", 15);
        await checkInNoCash(b.code);

        const before = await getBoard(staff, "bogura", DAY);
        expect(before.stats.pendingCash).toBeGreaterThanOrEqual(q.total - 500);
        // Checked in without paying: counted as "with balance due" on the desk.
        expect(before.stats.checkedInDue).toBeGreaterThanOrEqual(1);
        const dueCell = before.pitches.find((p) => p.id === "bogura-c")!.cells.find((x) => x.cellStart === cell(15))!;
        expect(dueCell.booking).toMatchObject({ bookingStatus: "CHECKED_IN", paymentStatus: "PARTIALLY_PAID", balanceDue: q.total - 500 });

        const out = await checkOut(staff, b.code);
        expect(out).toMatchObject({ bookingStatus: "COMPLETED", paymentStatus: "PAID", balanceDue: 0 });
        expect(out.can).toMatchObject({ checkOut: false, collectBalance: false, undoCheckOut: true, cancel: false });

        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        expect(await SlotClaimModel.countDocuments({ bookingId: saved!.id })).toBe(1); // the slot stays booked
        expect(await PaymentModel.countDocuments({ bookingId: saved!.id, kind: "BALANCE", status: "SUCCESS" })).toBe(1);

        const board = await getBoard(staff, "bogura", DAY);
        const shown = board.pitches.find((p) => p.id === "bogura-c")!.cells.find((c) => c.cellStart === cell(15))!;
        expect(shown.booking).toMatchObject({ code: b.code, bookingStatus: "COMPLETED", balanceDue: 0 });
        expect(board.stats.checkedOut).toBe(before.stats.checkedOut + 1);
        expect(board.stats.checkedIn).toBe(before.stats.checkedIn - 1);
        expect(board.stats.checkedInDue).toBe(before.stats.checkedInDue - 1); // paid at check-out
        expect(board.stats.totalSales).toBe(before.stats.totalSales); // still counted as a sale
        expect(board.stats.collected).toBe(before.stats.collected + (q.total - 500));
        expect(board.stats.pendingCash).toBe(before.stats.pendingCash - (q.total - 500));
        // Sales always split exactly into collected + pending.
        expect(board.stats.collected + board.stats.pendingCash).toBe(board.stats.totalSales);

        await expect(checkOut(staff, b.code)).rejects.toMatchObject({ code: "NOT_CHECKOUTABLE", status: 409 });
    });

    it("a fully paid checked-in booking checks out without taking more money; undo puts it back", async () => {
        const { b } = await bookedWithAdvance("bogura-a", 18);
        await checkInNoCash(b.code);
        await collectBalance(staff, b.code);
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        const pays = await PaymentModel.countDocuments({ bookingId: saved!.id });

        const out = await checkOut(staff, b.code);
        expect(out).toMatchObject({ bookingStatus: "COMPLETED", paymentStatus: "PAID" });
        expect(await PaymentModel.countDocuments({ bookingId: saved!.id })).toBe(pays);

        const back = await undoCheckOut(staff, b.code, undefined);
        expect(back.bookingStatus).toBe("CHECKED_IN");
        await expect(undoCheckOut(staff, b.code, undefined)).rejects.toMatchObject({ code: "NOT_CHECKED_OUT" });
    });
});
