// Admin guarantees: branch scope, one check-in per booking, one balance collection, walk-ins vs holds.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, dhakaParts, dhakaToUtc } from "@/lib/time";
import { AuditLogModel, BookingModel, CheckInModel, PaymentModel } from "@/models";
import { checkIn, collectBalance } from "@/server/admin/operations";
import { getBookingDetail, searchBookings } from "@/server/admin/search";
import { createWalkIn, quoteWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import type { Booking } from "@/types/booking";
import { resetDb, startDb, stopDb } from "./helpers";
import { todayDhaka } from "@/lib/time.server";

const mkUser = (id: string, role: ServerUser["role"], branchIds: string[]): ServerUser => ({
    id, name: id, role, phone: "01700000000", email: null, branchIds, permissions: [],
});
const staff = mkUser("staff-bogura", "STAFF", ["bogura"]);
const staffDhaka = mkUser("staff-dhaka", "STAFF", ["dhaka"]);
const admin = mkUser("admin", "SUPER_ADMIN", []);
const customer = mkUser("cust", "CUSTOMER", []);

// A confirmed booking that starts in 10 minutes: inside the check-in window.
const mk = (code: string, over: Partial<Booking> = {}): Booking => {
    const start = new Date(Date.now() + 10 * 60_000);
    return {
        id: `id-${code}`, bookingCode: code, customerId: "c1", customerName: "Rahim", phone: "01711112222",
        branchId: "bogura", pitchId: "bogura-b", date: dhakaParts(start).date,
        startAt: start.toISOString(), endAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
        cellStarts: [start.toISOString()], slotCount: 1, bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID",
        subtotal: 1600, vatAmount: 0, total: 1600, advanceAmount: 640, balanceAmount: 960,
        advancePercentSnapshot: 40, vatRatePercentSnapshot: null, source: "online",
        holdExpiresAt: start.toISOString(), createdAt: new Date().toISOString(), ...over,
    };
};
const NAME = { identity: { method: "NAME" as const }, collectBalance: false };
const now = new Date("2026-10-30T12:00:00Z");
const TODAY = await todayDhaka(now);
const cell = (h: number) => dhakaToUtc(addDays(TODAY, 1), h * 60).toISOString();

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(resetDb);

describe("branch scope", () => {
    it("staff cannot read or search another branch's bookings", async () => {
        await BookingModel.create([mk("KT-TEST22"), mk("KT-TEST33", { id: "id-2", branchId: "other" })]);

        await expect(getBookingDetail(staff, "KT-TEST33")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
        expect((await getBookingDetail(staff, "KT-TEST22")).booking.code).toBe("KT-TEST22");

        expect((await searchBookings(staff, {})).map((b) => b.code)).toEqual(["KT-TEST22"]);
        await expect(searchBookings(staff, { branch: "other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await searchBookings(admin, {})).toHaveLength(2);
    });

    it("staff cannot act on another branch's slots", async () => {
        await expect(
            createWalkIn(staffDhaka, { pitchId: "bogura-b", cellStarts: [cell(12)], phone: "01733334444", name: "Karim", cashReceived: 2000 })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
});

describe("check-in", () => {
    it("a booking cannot be checked in twice without a logged Super Admin override", async () => {
        await BookingModel.create(mk("KT-TEST22"));
        await checkIn(staff, "KT-TEST22", NAME);

        await expect(checkIn(staff, "KT-TEST22", NAME)).rejects.toMatchObject({ code: "CHECKIN_BLOCKED" });
        // Staff cannot override, even with a reason. An admin needs a reason too.
        await expect(checkIn(staff, "KT-TEST22", { ...NAME, overrideReason: "customer insists" })).rejects.toMatchObject({ code: "CHECKIN_BLOCKED" });
        await expect(checkIn(admin, "KT-TEST22", NAME)).rejects.toMatchObject({ code: "CHECKIN_BLOCKED" });

        await checkIn(admin, "KT-TEST22", { ...NAME, overrideReason: "Wristband lost, re-issued" });
        expect(await CheckInModel.countDocuments({})).toBe(2);
        expect(await AuditLogModel.countDocuments({ action: "CHECKIN_OVERRIDE" })).toBe(1);
        expect(await AuditLogModel.countDocuments({ action: "CHECKIN_BLOCKED" })).toBe(3);
    });

    it("two phones checking in at the same moment: exactly one wins", async () => {
        await BookingModel.create(mk("KT-TEST22"));
        const r = await Promise.allSettled([checkIn(staff, "KT-TEST22", NAME), checkIn(staff, "KT-TEST22", NAME)]);

        expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
        expect(await CheckInModel.countDocuments({})).toBe(1);
    });
});

describe("balance and walk-ins", () => {
    it("the balance can only be collected once, even if two staff tap together", async () => {
        await BookingModel.create(mk("KT-TEST22"));
        const r = await Promise.allSettled([collectBalance(staff, "KT-TEST22"), collectBalance(staff, "KT-TEST22")]);

        expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
        expect(await PaymentModel.countDocuments({ kind: "BALANCE" })).toBe(1);
        expect((await BookingModel.findOne({ bookingCode: "KT-TEST22" }).lean<any>()).paymentStatus).toBe("PAID");
    });

    it("a walk-in cannot take a slot an online customer is holding, and cash must cover the advance", async () => {
        await createBooking(customer, { pitchId: "bogura-b", cellStarts: [cell(12)], phone: "01711111111" });
        await expect(
            createWalkIn(staff, { pitchId: "bogura-b", cellStarts: [cell(12)], phone: "01733334444", name: "Karim", cashReceived: 5000 })
        ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

        const q = await quoteWalkIn(staff, "bogura-b", [cell(15)]);
        await expect(
            createWalkIn(staff, { pitchId: "bogura-b", cellStarts: [cell(15)], phone: "01733334444", name: "Karim", cashReceived: q.advance - 1 })
        ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });

        const b = await createWalkIn(staff, { pitchId: "bogura-b", cellStarts: [cell(15)], phone: "01733334444", name: "Karim", cashReceived: q.advance });
        expect(b).toMatchObject({ source: "counter", bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID" });
        expect(b.balanceDue).toBe(q.total - q.advance);
        expect(await AuditLogModel.countDocuments({ action: "WALKIN_CREATED" })).toBe(1);
    });
});