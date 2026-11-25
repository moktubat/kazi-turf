// Undo check-out with "the balance was not really received" (2026-11-25). The booking opens
// again AND the cash balance payment is reversed (VOIDED, never deleted), so the board and
// the drawer show the balance as due again. Staff may reverse only cash they recorded
// themselves today; anything else needs a Super Admin.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { AuditLogModel, BookingModel, PaymentModel } from "@/models";
import { undoCheckOutSchema } from "@/schemas/admin";
import { getBoard } from "@/server/admin/board";
import { checkIn, checkOut, collectBalance, undoCheckOut } from "@/server/admin/operations";
import { getBookingDetail } from "@/server/admin/search";
import { createWalkIn, quoteWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { startDb, stopDb } from "./helpers";

const mk = (id: string, role: ServerUser["role"]): ServerUser => ({
    id, name: id, role, phone: "01354490362", email: null, branchIds: ["bogura"], permissions: role === "SUPER_ADMIN" ? ["*"] : [],
});
const staff = mk("staff-a", "STAFF");
const otherStaff = mk("staff-b", "STAFF");
const admin = mk("admin-1", "SUPER_ADMIN");
let DAY = "";
let slot = 0;
const nextCell = () => dhakaToUtc(DAY, (4 + slot++) * 90).toISOString(); // 90-minute fixture slots from 06:00

beforeAll(async () => {
    await startDb();
    DAY = addDays(await todayDhaka(new Date()), 1);
}, 180_000);
afterAll(stopDb);

/** KT-W49JFB: ৳1,000 advance, balance collected in cash, checked out without ever checking in. */
async function paidAndCheckedOut(by: ServerUser = staff) {
    const cs = nextCell();
    const q = await quoteWalkIn(by, "bogura-a", [cs]);
    const b = await createWalkIn(by, { pitchId: "bogura-a", cellStarts: [cs], phone: "01303199653", name: "Testing 001", cashReceived: 1000 });
    await collectBalance(by, b.code);
    const out = await checkOut(by, b.code);
    expect(out).toMatchObject({ bookingStatus: "COMPLETED", paymentStatus: "PAID", balanceDue: 0 });
    return { code: b.code, cs, due: q.total - 1000 };
}

describe("undo check-out and reverse the balance", () => {
    it("the schema accepts reverseBalance as a boolean only", () => {
        expect(undoCheckOutSchema.parse({ reverseBalance: true }).reverseBalance).toBe(true);
        expect(undoCheckOutSchema.parse({}).reverseBalance).toBeUndefined();
        expect(undoCheckOutSchema.safeParse({ reverseBalance: "yes" }).success).toBe(false);
    });

    it("the drawer offers the cash payment to the staff member who recorded it", async () => {
        const { code, due } = await paidAndCheckedOut();
        const { booking } = await getBookingDetail(staff, code);
        expect(booking.reversibleCash).toMatchObject({ amount: due });
        // Another staff member may not take back cash someone else recorded; a Super Admin may.
        expect((await getBookingDetail(otherStaff, code)).booking.reversibleCash).toBeNull();
        expect((await getBookingDetail(admin, code)).booking.reversibleCash).toMatchObject({ amount: due });
    });

    it("reversing: back to Booked with the balance due again, the payment VOIDED (kept), board shows Due", async () => {
        const { code, cs, due } = await paidAndCheckedOut();
        const before = await getBoard(staff, "bogura", DAY);

        const after = await undoCheckOut(staff, code, "Customer did not pay", new Date(), true);
        expect(after).toMatchObject({ bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", balanceDue: due });
        expect(after.can.collectBalance).toBe(true);
        expect(after.reversibleCash).toBeNull();
        const balance = after.payments.find((p) => p.kind === "BALANCE")!;
        expect(balance).toMatchObject({ status: "VOIDED", amount: due });

        const saved = await BookingModel.findOne({ bookingCode: code }).lean<Booking>();
        expect(saved).toMatchObject({ balanceAmount: due, paymentStatus: "PARTIALLY_PAID" });
        const voided = await PaymentModel.findOne({ bookingId: saved!.id, kind: "BALANCE" }).lean<Payment>();
        expect(voided).toMatchObject({ status: "VOIDED", voidedBy: staff.id, voidReason: "Customer did not pay" });
        expect(await AuditLogModel.countDocuments({ action: "PAYMENT_REVERSED", entityId: code })).toBe(1);

        const board = await getBoard(staff, "bogura", DAY);
        const shown = board.pitches.find((p) => p.id === "bogura-a")!.cells.find((c) => c.cellStart === cs)!;
        expect(shown.booking).toMatchObject({ bookingStatus: "CONFIRMED", balanceDue: due });
        expect(board.stats.collected).toBe(before.stats.collected - due);
        expect(board.stats.pendingCash).toBe(before.stats.pendingCash + due);

        // It can be collected again normally, and it is no longer checked out.
        expect(await collectBalance(staff, code)).toMatchObject({ paymentStatus: "PAID", balanceDue: 0 });
        await expect(undoCheckOut(staff, code, undefined, new Date(), true)).rejects.toMatchObject({ code: "NOT_CHECKED_OUT" });
    });

    it("checked in first: undo goes back to Checked in with the balance due", async () => {
        const cs = nextCell();
        const b = await createWalkIn(staff, { pitchId: "bogura-b", cellStarts: [cs], phone: "01303199653", name: "Nabil", cashReceived: 500 });
        await checkIn(staff, b.code, { identity: { method: "NAME" }, collectBalance: false });
        await checkOut(staff, b.code); // collects the balance at check-out
        const after = await undoCheckOut(staff, b.code, undefined, new Date(), true);
        expect(after).toMatchObject({ bookingStatus: "CHECKED_IN", paymentStatus: "PARTIALLY_PAID", balanceDue: after.total - 500 });
    });

    it("without reverseBalance the money stays collected", async () => {
        const { code } = await paidAndCheckedOut();
        const after = await undoCheckOut(staff, code, undefined);
        expect(after).toMatchObject({ bookingStatus: "CONFIRMED", paymentStatus: "PAID", balanceDue: 0 });
        expect(after.payments.every((p) => p.status === "SUCCESS")).toBe(true);
    });

    it("another staff member is refused (nothing changes); a Super Admin may reverse it", async () => {
        const { code, due } = await paidAndCheckedOut();
        await expect(undoCheckOut(otherStaff, code, undefined, new Date(), true)).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED", status: 403 });
        expect((await getBookingDetail(staff, code)).booking).toMatchObject({ bookingStatus: "COMPLETED", paymentStatus: "PAID" });
        expect(await undoCheckOut(admin, code, undefined, new Date(), true)).toMatchObject({ paymentStatus: "PARTIALLY_PAID", balanceDue: due });
    });

    it("staff cannot reverse cash they recorded on an earlier day", async () => {
        const { code } = await paidAndCheckedOut();
        const tomorrow = new Date(Date.now() + 2 * 86_400_000);
        expect((await getBookingDetail(staff, code)).booking.reversibleCash).not.toBeNull();
        await expect(undoCheckOut(staff, code, undefined, tomorrow, true)).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED" });
    });

    it("a booking with no cash balance payment has nothing to reverse", async () => {
        const cs = nextCell();
        const q = await quoteWalkIn(staff, "bogura-c", [cs]);
        const b = await createWalkIn(staff, { pitchId: "bogura-c", cellStarts: [cs], phone: "01303199653", name: "Full", cashReceived: q.total });
        await checkOut(staff, b.code);
        expect((await getBookingDetail(staff, b.code)).booking.reversibleCash).toBeNull();
        await expect(undoCheckOut(staff, b.code, undefined, new Date(), true)).rejects.toMatchObject({ code: "NOTHING_TO_REVERSE" });
    });
});
