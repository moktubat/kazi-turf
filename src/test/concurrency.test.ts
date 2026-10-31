// The core promise (spec §1.2): two customers can never confirm the same pitch and time.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, dhakaToUtc, todayDhaka } from "@/lib/time";
import { BookingModel, SlotClaimModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { resetDb, startDb, stopDb } from "./helpers";

const PITCH = "bogura-b"; // allows 2 consecutive slots
const user = (n: number): ServerUser => ({
    id: `u${n}`,
    name: `Customer ${n}`,
    role: "CUSTOMER",
    phone: "01711111111",
    email: null,
    branchIds: [],
    permissions: [],
});

// Tomorrow at the given Dhaka time. 12:00 and 13:30 and 15:00 are consecutive 90-minute cells.
const tomorrow = await todayDhaka(new Date());
const cell = (h: number, m = 0) =>
    dhakaToUtc(addDays(tomorrow, 1), h * 60 + m).toISOString();
const book = (n: number, cells: string[]) =>
    createBooking(user(n), { pitchId: PITCH, cellStarts: cells, phone: "01711111111" });

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(resetDb);

describe("slot claims", () => {
    it("exactly one of ten simultaneous holds on the same cell wins", async () => {
        const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => book(i, [cell(12)])));

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        for (const r of results) {
            if (r.status === "rejected") expect(r.reason.code).toBe("SLOT_UNAVAILABLE");
        }
        expect(await SlotClaimModel.countDocuments({})).toBe(1);
        expect(await BookingModel.countDocuments({})).toBe(1);
    });

    it("a multi-slot booking that overlaps by one cell loses cleanly and leaves no partial claims", async () => {
        await book(1, [cell(12), cell(13, 30)]);
        await expect(book(2, [cell(13, 30), cell(15)])).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

        expect(await SlotClaimModel.countDocuments({})).toBe(2); // the 15:00 cell was not left claimed
        expect(await BookingModel.countDocuments({})).toBe(1);
    });

    it("an unexpired hold blocks the cell", async () => {
        await book(1, [cell(12)]);
        await expect(book(2, [cell(12)])).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    });

    it("an expired hold is ignored immediately and can be taken over", async () => {
        await SlotClaimModel.create({
            pitchId: PITCH,
            cellStart: cell(12),
            state: "HELD",
            bookingId: "old-booking",
            expiresAt: new Date(Date.now() - 60_000).toISOString(), // no cleanup job has run
        });

        const dto = await book(1, [cell(12)]);
        expect(dto.holdActive).toBe(true);

        const claims = await SlotClaimModel.find({}).lean<any[]>();
        expect(claims).toHaveLength(1);
        expect(claims[0].bookingId).not.toBe("old-booking");
    });

    it("the unique index rejects a duplicate claim even if application code is bypassed", async () => {
        await SlotClaimModel.create({ pitchId: PITCH, cellStart: cell(12), state: "BOOKED", bookingId: "a" });
        await expect(
            SlotClaimModel.create({ pitchId: PITCH, cellStart: cell(12), state: "BOOKED", bookingId: "b" })
        ).rejects.toMatchObject({ code: 11000 });
    });

    it("a customer's new Continue replaces their old unpaid hold", async () => {
        const first = await book(1, [cell(12)]);
        const second = await book(1, [cell(15)]);

        expect(second.code).not.toBe(first.code);
        expect(await BookingModel.countDocuments({})).toBe(1);
        const claims = await SlotClaimModel.find({}).lean<any[]>();
        expect(claims.map((c) => c.cellStart)).toEqual([cell(15)]);
    });
});