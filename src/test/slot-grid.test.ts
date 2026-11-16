// Individual slots follow each field's OWN slot length. A pricing time range
// (Quick Pick) prices many separate slots; staff can hold/block any single one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pitches } from "@/data/pitches";
import { priceAdjustments, pricingRules } from "@/data/pricing";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, SlotClaimModel } from "@/models";
import { setBlock } from "@/server/admin/operations";
import { createPitch, createRate, updatePitch } from "@/server/admin/setup";
import { createWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import { getPitchAvailability } from "@/server/availability";
import { createBooking } from "@/server/bookings";
import { checkInState } from "@/server/admin/dto";
import type { Booking } from "@/types/booking";
import { startDb, stopDb } from "./helpers";

const mk = (id: string, role: ServerUser["role"], branchIds: string[] = []): ServerUser => ({
    id, name: id, role, phone: "01354490362", email: null, branchIds, permissions: [],
});
const admin = mk("admin", "SUPER_ADMIN");
const staff = mk("staff", "STAFF", ["bogura"]);
const custA = mk("cust-a", "CUSTOMER");
const custB = mk("cust-b", "CUSTOMER");
const custC = mk("cust-c", "CUSTOMER");
const ALL = [0, 1, 2, 3, 4, 5, 6];

let DAY = "";
let HOUR = ""; // 60-minute field
let ODD = "";  // 105-minute field
const at = (h: number) => dhakaToUtc(DAY, Math.round(h * 60)).toISOString();
const field = (name: string, slotMinutes: number) => ({
    branchId: "bogura", name, sport: "Football", format: "5 vs 5", dimensions: "", surface: "",
    openTime: "00:00" as const, closeTime: "24:00" as const, slotMinutes, maxConsecutiveSlots: 3,
    facilities: [], image: "", status: "ACTIVE" as const,
});
const rate = (pitchId: string, startTime: string, endTime: string, pricePerSlot: number) => ({
    pitchId, days: ALL, startTime, endTime, pricePerSlot, tier: "Off-peak" as const,
    effectiveFrom: "", effectiveTo: "", discountType: null, discountDirection: null, discountValue: null,
});
const cells = (pitchId: string) => getPitchAvailability(pitchId, DAY);
const status = async (pitchId: string, iso: string) => (await cells(pitchId)).find((c) => c.cellStart === iso)!.status;

beforeAll(async () => {
    await startDb();
    DAY = addDays(await todayDhaka(new Date()), 1);
    pitches.splice(0);
    pricingRules.splice(0);
    priceAdjustments.splice(0);
    await createPitch(admin, field("Hour Field", 60));
    await createPitch(admin, field("Odd Field", 105));
    HOUR = pitches.find((p) => p.name === "Hour Field")!.id;
    ODD = pitches.find((p) => p.name === "Odd Field")!.id;
    // Quick Pick "Late night 12–6 AM" = ONE pricing range, six separate 60-minute slots.
    await createRate(admin, rate(HOUR, "00:00", "06:00", 1200));
    await createRate(admin, rate(HOUR, "06:00", "24:00", 1500));
}, 180_000);
afterAll(stopDb);

describe("slot generation follows each field's slot length", () => {
    it("a 60-minute field has 24 individual one-hour slots; a 12–6 AM price covers six of them", async () => {
        const c = await cells(HOUR);
        expect(c).toHaveLength(24);
        expect(c.slice(0, 6).map((x) => `${x.start}-${x.end}`)).toEqual([
            "00:00-01:00", "01:00-02:00", "02:00-03:00", "03:00-04:00", "04:00-05:00", "05:00-06:00",
        ]);
        expect(c.slice(0, 6).every((x) => x.price === 1200)).toBe(true);
        expect(c[6].price).toBe(1500);
        expect(c[23].end).toBe("00:00"); // last slot of the day ends at midnight
    });

    it("a 105-minute field uses its own grid; a range must end on that grid", async () => {
        await createRate(admin, rate(ODD, "00:00", "22:45", 2000)); // 13 × 105 min = 22:45
        const c = await cells(ODD);
        expect(c).toHaveLength(13);
        expect(c[1].start).toBe("01:45");
        await expect(createRate(admin, rate(ODD, "22:45", "24:00", 2000))).rejects.toMatchObject({ code: "OFF_GRID" });
    });
});

describe("individual slot hold / maintenance (60-minute field)", () => {
    it("holding only 12–1 AM leaves the other five night slots available", async () => {
        await setBlock(staff, { pitchId: HOUR, cellStart: at(0), block: true, kind: "HELD", reason: "Friends" });
        expect(await status(HOUR, at(0))).toBe("HELD");
        for (const h of [1, 2, 3, 4, 5]) expect(await status(HOUR, at(h))).toBe("AVAILABLE");
        expect(await BookingModel.countDocuments({})).toBe(0); // no fake booking
    });

    it("maintenance on 1–2 AM only; customers cannot book either blocked slot", async () => {
        await setBlock(staff, { pitchId: HOUR, cellStart: at(1), block: true, kind: "MAINTENANCE", reason: "Lights" });
        expect(await status(HOUR, at(1))).toBe("MAINTENANCE");
        expect(await status(HOUR, at(2))).toBe("AVAILABLE");
        for (const h of [0, 1]) {
            await expect(createBooking(custA, { pitchId: HOUR, cellStarts: [at(h)], phone: "01711111111" }))
                .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
        }
    });

    it("a slot start that is not on this field's grid is refused", async () => {
        await expect(setBlock(staff, { pitchId: HOUR, cellStart: at(0.5), block: true, kind: "HELD", reason: "Bad" }))
            .rejects.toMatchObject({ code: "INVALID_SLOT" });
    });

    it("release and remove maintenance make just those slots available again", async () => {
        await setBlock(staff, { pitchId: HOUR, cellStart: at(0), block: false, kind: "HELD" });
        await setBlock(staff, { pitchId: HOUR, cellStart: at(1), block: false, kind: "MAINTENANCE" });
        expect(await status(HOUR, at(0))).toBe("AVAILABLE");
        expect(await status(HOUR, at(1))).toBe("AVAILABLE");
        expect(await SlotClaimModel.countDocuments({ pitchId: HOUR })).toBe(0);
    });
});

describe("bookings use the field's slot length", () => {
    it("two consecutive 60-minute slots can be booked online; end time is +2 h, not +3 h", async () => {
        const b = await createBooking(custA, { pitchId: HOUR, cellStarts: [at(8), at(9)], phone: "01711111111" });
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<{ endAt: string; subtotal: number }>();
        expect(saved?.endAt).toBe(at(10));
        expect(saved?.subtotal).toBe(3000); // 2 × ৳1,500, priced per slot
    });

    it("an overlapping reservation of one of those slots is refused", async () => {
        await expect(createBooking(custB, { pitchId: HOUR, cellStarts: [at(9), at(10)], phone: "01722222222" }))
            .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
        expect(await status(HOUR, at(10))).toBe("AVAILABLE"); // no partial claim left behind
    });

    it("non-adjacent slots are still refused", async () => {
        await expect(createBooking(custC, { pitchId: HOUR, cellStarts: [at(12), at(14)], phone: "01733333333" }))
            .rejects.toMatchObject({ code: "NOT_CONSECUTIVE" });
    });

    it("a two-slot walk-in on the 60-minute field ends after 2 hours", async () => {
        const w = await createWalkIn(staff, { pitchId: HOUR, cellStarts: [at(15), at(16)], phone: "01744444444", name: "Karim", cashReceived: 3000 });
        const saved = await BookingModel.findOne({ bookingCode: w.code }).lean<{ endAt: string }>();
        expect(saved?.endAt).toBe(at(17));
    });

    it("a staff hold cannot be placed on a slot a customer already reserved", async () => {
        await expect(setBlock(staff, { pitchId: HOUR, cellStart: at(8), block: true, kind: "MAINTENANCE", reason: "Repair" }))
            .rejects.toMatchObject({ code: "SLOT_TAKEN" });
    });
});

describe("changing a field's slot length", () => {
    it("is refused while the field has upcoming bookings (they were made for the old length)", async () => {
        // HOUR (60 min) has upcoming bookings from the tests above.
        const p = pitches.find((x) => x.id === HOUR)!;
        await expect(updatePitch(admin, { ...field("Hour Field", 90), id: HOUR }))
            .rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
        expect(p.slotMinutes).toBe(60);
        // The booked 8 AM slot must still be visible and not bookable again.
        expect(await status(HOUR, at(8))).not.toBe("AVAILABLE");
    });

    it("is allowed on a field with nothing upcoming, and the new grid applies at once", async () => {
        await createPitch(admin, field("Fresh Field", 30));
        const id = pitches.find((p) => p.name === "Fresh Field")!.id;
        await createRate(admin, rate(id, "00:00", "24:00", 1000));
        expect(await cells(id)).toHaveLength(48);
        await updatePitch(admin, { ...field("Fresh Field", 120), id });
        const c = await cells(id);
        expect(c).toHaveLength(12);
        expect(`${c[1].start}-${c[1].end}`).toBe("02:00-04:00");
    });
});

describe("custom durations end to end", () => {
    for (const len of [30, 45, 75, 150]) {
        it(`${len}-minute field: grid, price per slot, 2-slot booking end time, single-slot hold`, async () => {
            const name = `Len ${len}`;
            await createPitch(admin, field(name, len));
            const id = pitches.find((p) => p.name === name)!.id;
            const last = Math.floor(1440 / len) * len; // last whole-slot boundary
            const hhmm = `${String(Math.floor(last / 60)).padStart(2, "0")}:${String(last % 60).padStart(2, "0")}`;
            await createRate(admin, rate(id, "00:00", hhmm === "24:00" ? "24:00" : hhmm, 1000));

            const c = await cells(id);
            expect(c).toHaveLength(Math.floor(1440 / len));
            expect(c.every((x) => x.price === 1000)).toBe(true);

            // Two consecutive slots (index 3, 4) — works even for 150 min (9 slots a day).
            const cust = mk(`cust-len-${len}`, "CUSTOMER");
            const b = await createBooking(cust, { pitchId: id, cellStarts: [c[3].cellStart, c[4].cellStart], phone: "01711111111" });
            const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<{ startAt: string; endAt: string }>();
            expect(saved?.startAt).toBe(c[3].cellStart);
            expect(saved?.endAt).toBe(new Date(new Date(c[4].cellStart).getTime() + len * 60_000).toISOString());

            // Hold exactly one slot; its neighbours stay available.
            await setBlock(staff, { pitchId: id, cellStart: c[6].cellStart, block: true, kind: "HELD", reason: "Walk-in" });
            const after = await cells(id);
            expect(after[6].status).toBe("HELD");
            expect(after[5].status).toBe("AVAILABLE");
            expect(after[7].status).toBe("AVAILABLE");
        });
    }
});

describe("check-in window uses the real end time", () => {
    it("a 2 × 60-min walk-in (3–5 PM) is open at 4:30 PM and closed at 5:05 PM", async () => {
        const doc = await BookingModel.findOne({ pitchId: HOUR, source: "counter" }).lean<Booking>();
        expect(doc).toBeTruthy();
        const b = doc!;
        expect(checkInState(b, new Date(new Date(at(16.5)).getTime())).state).toBe("VALID");
        const late = checkInState(b, new Date(new Date(at(17)).getTime() + 5 * 60_000));
        expect(late.state).toBe("OUTSIDE_WINDOW");
        expect(late.message).toMatch(/ended/);
    });
});
