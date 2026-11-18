// Staff may book a walk-in with no advance (৳0 cash). The whole total stays due, the balance
// can be collected later, and cancelling refunds nothing. The online /book flow still
// requires its advance.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, PaymentModel } from "@/models";
import { walkInSchema } from "@/schemas/admin";
import { canCollectBalance } from "@/server/admin/dto";
import { cancelBooking, collectBalance } from "@/server/admin/operations";
import { createWalkIn, quoteWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import type { Booking } from "@/types/booking";
import { startDb, stopDb } from "./helpers";

const mk = (id: string, role: ServerUser["role"], branchIds: string[] = []): ServerUser => ({
    id, name: id, role, phone: "01354490362", email: null, branchIds, permissions: [],
});
const staff = mk("staff-bogura", "STAFF", ["bogura"]);
const customer = mk("cust-no-adv", "CUSTOMER");
let cell: (h: number) => string;

beforeAll(async () => {
    await startDb();
    const today = await todayDhaka(new Date());
    cell = (h: number) => dhakaToUtc(addDays(today, 2), h * 60).toISOString();
}, 180_000);
afterAll(stopDb);

const walkIn = (pitchId: string, h: number, cashReceived: number) =>
    createWalkIn(staff, { pitchId, cellStarts: [cell(h)], phone: "01755556666", name: "Karim", cashReceived });

describe("walk-in with no advance", () => {
    it("the request schema accepts 0 and still rejects negatives", () => {
        const base = { pitchId: "bogura-b", cellStarts: [cell(12)], phone: "01755556666", name: "Karim" };
        expect(walkInSchema.parse({ ...base, cashReceived: 0 }).cashReceived).toBe(0);
        expect(walkInSchema.safeParse({ ...base, cashReceived: -1 }).success).toBe(false);
    });

    it("books a confirmed slot with the whole total due and no payment row", async () => {
        const q = await quoteWalkIn(staff, "bogura-b", [cell(12)]);
        const b = await walkIn("bogura-b", 12, 0);
        expect(b).toMatchObject({
            bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", advancePaid: 0, balanceDue: q.total, total: q.total,
        });
        expect(b.payments).toEqual([]);
        expect(b.can.collectBalance).toBe(true);

        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        expect(saved).toMatchObject({ advanceAmount: 0, balanceAmount: q.total });
        expect(canCollectBalance(saved!)).toBe(true);
        expect(await PaymentModel.countDocuments({ bookingId: saved!.id })).toBe(0);
    });

    it("the slot is taken: a second booking of it is refused", async () => {
        await expect(walkIn("bogura-b", 12, 0)).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    });

    it("collecting the balance takes the full total and marks it paid", async () => {
        const q = await quoteWalkIn(staff, "bogura-a", [cell(12)]);
        const b = await walkIn("bogura-a", 12, 0);
        const after = await collectBalance(staff, b.code);
        expect(after).toMatchObject({ paymentStatus: "PAID", balanceDue: 0 });
        expect(after.payments).toEqual([expect.objectContaining({ kind: "BALANCE", provider: "CASH", amount: q.total })]);
    });

    it("cancelling a no-advance walk-in has nothing to refund", async () => {
        const b = await walkIn("bogura-b", 15, 0);
        const after = await cancelBooking(staff, b.code, "Customer did not come");
        expect(after).toMatchObject({ bookingStatus: "CANCELLED", paymentStatus: "CANCELLED" });
    });

    it("cancelling a walk-in that paid an advance still goes to refund pending", async () => {
        const q = await quoteWalkIn(staff, "bogura-b", [cell(18)]);
        const b = await walkIn("bogura-b", 18, q.advance);
        const after = await cancelBooking(staff, b.code, "Rain");
        expect(after).toMatchObject({ bookingStatus: "CANCELLED", paymentStatus: "REFUND_PENDING" });
    });

    it("cash above the total is still refused", async () => {
        const q = await quoteWalkIn(staff, "bogura-a", [cell(15)]);
        await expect(walkIn("bogura-a", 15, q.total + 1)).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    });
});

describe("online /book is unchanged", () => {
    it("an online booking still asks for its advance before it is confirmed", async () => {
        const q = await quoteWalkIn(staff, "bogura-a", [cell(18)]);
        const { code } = await createBooking(customer, { pitchId: "bogura-a", cellStarts: [cell(18)], phone: "01711110000" });
        const saved = await BookingModel.findOne({ bookingCode: code }).lean<Booking>();
        expect(q.advance).toBeGreaterThan(0);
        expect(saved).toMatchObject({ bookingStatus: "PENDING_PAYMENT", paymentStatus: "NOT_STARTED", advanceAmount: q.advance });
    });
});
