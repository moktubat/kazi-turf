// Seasonal (date-range) pricing and staff slot holds / maintenance.
// Self-contained: creates its own field and slot prices through the real Setup functions.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pitches } from "@/data/pitches";
import { priceAdjustments, pricingRules } from "@/data/pricing";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, SlotClaimModel } from "@/models";
import { setBlock } from "@/server/admin/operations";
import {
    createAdjustment, createPitch, createRate, deleteAdjustment, deletePitch, getSetupData, updateAdjustment,
} from "@/server/admin/setup";
import type { ServerUser } from "@/server/auth/session";
import { getPitchAvailability } from "@/server/availability";
import { createBooking } from "@/server/bookings";
import { priceForCell, quote } from "@/server/pricing";
import { startDb, stopDb } from "./helpers";

const mkUser = (id: string, role: ServerUser["role"], branchIds: string[], permissions: string[] = []): ServerUser => ({
    id, name: id, role, phone: "01354490362", email: null, branchIds, permissions,
});
const admin = mkUser("admin", "SUPER_ADMIN", []);
const editor = mkUser("editor", "STAFF", ["bogura"], ["pitches.edit"]);
const deskStaff = mkUser("desk", "STAFF", ["bogura"]);          // Staff Desk only, no Setup
const otherStaff = mkUser("other", "STAFF", ["elsewhere"]);
const customer = mkUser("cust", "CUSTOMER", []);

let TODAY = "";
let PITCH = "";
const at = (date: string, h: number) => dhakaToUtc(date, h * 60);
const ALL = [0, 1, 2, 3, 4, 5, 6];

const field = (name: string) => ({
    branchId: "bogura", name, sport: "Football", format: "5 vs 5", dimensions: "", surface: "",
    openTime: "00:00" as const, closeTime: "24:00" as const, slotMinutes: 90, maxConsecutiveSlots: 2,
    facilities: [], image: "", status: "ACTIVE" as const,
});
const adj = (over: Record<string, unknown> = {}) => ({
    label: "Ramadan", pitchIds: [PITCH], effectiveFrom: addDays(TODAY, 3), effectiveTo: addDays(TODAY, 5),
    days: ALL, startTime: "00:00", endTime: "24:00", direction: "DISCOUNT" as const, type: "PERCENT" as const, value: 20,
    ...over,
});

beforeAll(async () => {
    await startDb();
    TODAY = await todayDhaka(new Date());
    pitches.splice(0);
    pricingRules.splice(0);
    priceAdjustments.splice(0);
    await createPitch(admin, field("Test Field"));
    PITCH = pitches.find((p) => p.name === "Test Field")!.id;
    // Regular price ৳2,000 with a standing 10% promo → customers normally pay ৳1,800.
    await createRate(admin, {
        pitchId: PITCH, days: ALL, startTime: "00:00", endTime: "24:00", pricePerSlot: 2000, tier: "Off-peak",
        effectiveFrom: "", effectiveTo: "", discountType: "PERCENT", discountDirection: "DISCOUNT", discountValue: 10,
    });
}, 180_000);
afterAll(stopDb);

describe("seasonal pricing", () => {
    it("normal price applies before, after and outside the date range", () => {
        expect(priceForCell(PITCH, at(addDays(TODAY, 1), 12))!.price).toBe(1800);
    });

    it("applies a reduction during the range, without stacking on the standing promo", async () => {
        await createAdjustment(editor, adj());
        const inRange = priceForCell(PITCH, at(addDays(TODAY, 3), 12))!;
        expect(inRange.price).toBe(1600); // 2000 − 20%, not 1800 − 20% (1440)
        expect(inRange.originalPrice).toBe(2000);
        expect(inRange.hasDiscount).toBe(true);
        expect(priceForCell(PITCH, at(addDays(TODAY, 5), 22))!.price).toBe(1600); // end date is inclusive
        expect(priceForCell(PITCH, at(addDays(TODAY, 6), 12))!.price).toBe(1800); // range over → normal again
        expect(priceForCell(PITCH, at(addDays(TODAY, 2), 12))!.price).toBe(1800);
    });

    it("an increase can target only some slots (time window + weekdays)", async () => {
        const d = addDays(TODAY, 10);
        const dow = new Date(`${d}T12:00:00+06:00`).getUTCDay();
        await createAdjustment(admin, adj({
            label: "Vacation season", direction: "SURCHARGE", value: 25,
            effectiveFrom: d, effectiveTo: addDays(d, 20), days: [dow], startTime: "18:00", endTime: "24:00",
        }));
        expect(priceForCell(PITCH, at(d, 18))!.price).toBe(2500);
        expect(priceForCell(PITCH, at(d, 18))!.hasSurcharge).toBe(true);
        expect(priceForCell(PITCH, at(d, 12))!.price).toBe(1800);              // outside the time window
        expect(priceForCell(PITCH, at(addDays(d, 1), 18))!.price).toBe(1800);  // other weekday
    });

    it("quote() totals use the adjusted price", () => {
        const q = quote(PITCH, [at(addDays(TODAY, 3), 12), at(addDays(TODAY, 3), 13.5)]);
        expect(q.subtotal).toBe(3200);
        expect(q.originalSubtotal).toBe(4000);
    });

    it("refuses overlapping seasonal prices (only one adjustment per slot)", async () => {
        await expect(createAdjustment(admin, adj({ label: "Exams", effectiveFrom: addDays(TODAY, 5), effectiveTo: addDays(TODAY, 7) })))
            .rejects.toMatchObject({ code: "ADJUSTMENT_OVERLAP" });
    });

    it("refuses a dated slot price on top of a seasonal one, and vice versa", async () => {
        await expect(createRate(admin, {
            pitchId: PITCH, days: ALL, startTime: "00:00", endTime: "06:00", pricePerSlot: 1500, tier: "Off-peak",
            effectiveFrom: addDays(TODAY, 4), effectiveTo: addDays(TODAY, 4), discountType: null, discountDirection: null, discountValue: null,
        })).rejects.toMatchObject({ code: "RATE_OVERLAP" });

        await createRate(admin, {
            pitchId: PITCH, days: ALL, startTime: "00:00", endTime: "06:00", pricePerSlot: 1500, tier: "Off-peak",
            effectiveFrom: addDays(TODAY, 40), effectiveTo: addDays(TODAY, 41), discountType: null, discountDirection: null, discountValue: null,
        });
        await expect(createAdjustment(admin, adj({ label: "Eid week", effectiveFrom: addDays(TODAY, 40), effectiveTo: addDays(TODAY, 45) })))
            .rejects.toMatchObject({ code: "ADJUSTMENT_OVERLAP" });
    });

    it("refuses a fixed reduction that would make a slot free, and a range already over", async () => {
        await expect(createAdjustment(admin, adj({ effectiveFrom: addDays(TODAY, 50), effectiveTo: addDays(TODAY, 51), type: "FIXED", value: 2000 })))
            .rejects.toMatchObject({ code: "ADJUSTMENT_TOO_LARGE" });
        await expect(createAdjustment(admin, adj({ effectiveFrom: addDays(TODAY, -5), effectiveTo: addDays(TODAY, -1) })))
            .rejects.toMatchObject({ code: "IN_PAST" });
    });

    it("needs Setup (pitch edit) access", async () => {
        await expect(createAdjustment(deskStaff, adj({ effectiveFrom: addDays(TODAY, 60), effectiveTo: addDays(TODAY, 61) })))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(createAdjustment(otherStaff, adj({ effectiveFrom: addDays(TODAY, 60), effectiveTo: addDays(TODAY, 61) })))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("update and delete restore the normal price", async () => {
        const a = priceAdjustments.find((x) => x.label === "Ramadan")!;
        await updateAdjustment(admin, { ...adj({ value: 50 }), id: a.id });
        expect(priceForCell(PITCH, at(addDays(TODAY, 3), 12))!.price).toBe(1000);
        await deleteAdjustment(admin, a.id);
        expect(priceForCell(PITCH, at(addDays(TODAY, 3), 12))!.price).toBe(1800);
    });

    it("is listed in Setup data, and dropped when its only field is deleted", async () => {
        const data = await getSetupData(admin, new Date());
        expect(data.today).toBe(TODAY);
        expect(data.adjustments.map((a) => a.label)).toContain("Vacation season");

        await createPitch(admin, field("Temp Field"));
        const temp = pitches.find((p) => p.name === "Temp Field")!.id;
        await createAdjustment(admin, adj({ label: "Temp only", pitchIds: [temp], effectiveFrom: addDays(TODAY, 30), effectiveTo: addDays(TODAY, 31) }));
        await deletePitch(admin, temp);
        expect(priceAdjustments.some((a) => a.label === "Temp only")).toBe(false);
    });
});

describe("staff hold / maintenance", () => {
    const d = () => addDays(TODAY, 1);

    it("a manual hold blocks customers immediately, creates no booking, and releases cleanly", async () => {
        const cell = at(d(), 12).toISOString();
        // Prime the 30 s availability cache, then block: the change must be visible at once.
        expect((await getPitchAvailability(PITCH, d())).find((c) => c.cellStart === cell)!.status).toBe("AVAILABLE");

        await setBlock(deskStaff, { pitchId: PITCH, cellStart: cell, block: true, kind: "HELD", reason: "Friends & family" });
        expect((await getPitchAvailability(PITCH, d())).find((c) => c.cellStart === cell)!.status).toBe("HELD");
        expect(await BookingModel.countDocuments({})).toBe(0); // no fake customer booking

        await expect(createBooking(customer, { pitchId: PITCH, cellStarts: [cell], phone: "01711111111" }))
            .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

        // A manual hold has no expiry: it is NOT cleared like an online hold.
        const claim = await SlotClaimModel.findOne({ pitchId: PITCH, cellStart: cell }).lean<{ expiresAt?: string; bookingId?: string }>();
        expect(claim?.expiresAt).toBeUndefined();
        expect(claim?.bookingId).toBeUndefined();

        await setBlock(deskStaff, { pitchId: PITCH, cellStart: cell, block: false, kind: "HELD" });
        expect((await getPitchAvailability(PITCH, d())).find((c) => c.cellStart === cell)!.status).toBe("AVAILABLE");
    });

    it("maintenance blocks customers and can be removed", async () => {
        const cell = at(d(), 15).toISOString();
        await setBlock(admin, { pitchId: PITCH, cellStart: cell, block: true, kind: "MAINTENANCE", reason: "Turf repair" });
        expect((await getPitchAvailability(PITCH, d())).find((c) => c.cellStart === cell)!.status).toBe("MAINTENANCE");
        await expect(createBooking(customer, { pitchId: PITCH, cellStarts: [cell], phone: "01711111111" }))
            .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
        await setBlock(admin, { pitchId: PITCH, cellStart: cell, block: false, kind: "MAINTENANCE" });
        expect((await getPitchAvailability(PITCH, d())).find((c) => c.cellStart === cell)!.status).toBe("AVAILABLE");
    });

    it("never overrides a customer's booking/hold, and respects branch scope", async () => {
        const cell = at(d(), 18).toISOString();
        await createBooking(customer, { pitchId: PITCH, cellStarts: [cell], phone: "01711111111" });
        await expect(setBlock(admin, { pitchId: PITCH, cellStart: cell, block: true, kind: "MAINTENANCE", reason: "Repair" }))
            .rejects.toMatchObject({ code: "SLOT_TAKEN" });
        await expect(setBlock(admin, { pitchId: PITCH, cellStart: cell, block: false, kind: "HELD" }))
            .rejects.toMatchObject({ code: "NOT_FOUND" }); // release never deletes a customer's hold

        await expect(setBlock(otherStaff, { pitchId: PITCH, cellStart: at(d(), 21).toISOString(), block: true, kind: "HELD", reason: "Walk-in" }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
});

describe("temporary prices: set a new price, any duration, overlaps", () => {
    const D = (n: number) => addDays(TODAY, n);

    it("increase by setting a new price: ৳2,000 → ৳2,500 (replaces the standing promo)", async () => {
        await createAdjustment(admin, adj({ label: "Eid", direction: "SURCHARGE", type: "PRICE", value: 2500, effectiveFrom: D(70), effectiveTo: D(70) }));
        const c = priceForCell(PITCH, at(D(70), 12))!;
        expect(c.price).toBe(2500);
        expect(c.originalPrice).toBe(2000);
        expect(c.hasSurcharge).toBe(true);
        // 1-day range: the day after is back to normal.
        expect(priceForCell(PITCH, at(D(71), 12))!.price).toBe(1800);
        // The /book cell flags the increase so customers see "৳2,000 → ৳2,500".
        const cell = (await getPitchAvailability(PITCH, D(70))).find((x) => x.cellStart === at(D(70), 12).toISOString())!;
        expect(cell.hasDiscount).toBe(true);
        expect(cell.price).toBeGreaterThan(cell.originalPrice);
    });

    it("reduction by setting a new price over several weeks: ৳2,000 → ৳1,500", async () => {
        await createAdjustment(admin, adj({ label: "Ramadan", type: "PRICE", value: 1500, effectiveFrom: D(72), effectiveTo: D(100) }));
        expect(priceForCell(PITCH, at(D(72), 12))!.price).toBe(1500);
        expect(priceForCell(PITCH, at(D(100), 22.5))!.price).toBe(1500);
        expect(priceForCell(PITCH, at(D(101), 12))!.price).toBe(1800);
        expect(quote(PITCH, [at(D(80), 12)]).subtotal).toBe(1500);
    });

    it("refuses a 'new price' that goes the wrong way", async () => {
        await expect(createAdjustment(admin, adj({ label: "Bad", direction: "SURCHARGE", type: "PRICE", value: 1500, effectiveFrom: D(110), effectiveTo: D(111) })))
            .rejects.toMatchObject({ code: "ADJUSTMENT_WRONG_WAY" });
        await expect(createAdjustment(admin, adj({ label: "Bad", direction: "DISCOUNT", type: "PRICE", value: 2600, effectiveFrom: D(110), effectiveTo: D(111) })))
            .rejects.toMatchObject({ code: "ADJUSTMENT_WRONG_WAY" });
    });

    it("an increase and a reduction cannot overlap, but back-to-back ranges are fine", async () => {
        await expect(createAdjustment(admin, adj({ label: "Clash", direction: "SURCHARGE", type: "PERCENT", value: 10, effectiveFrom: D(100), effectiveTo: D(105) })))
            .rejects.toMatchObject({ code: "ADJUSTMENT_OVERLAP" });
        await createAdjustment(admin, adj({ label: "After Ramadan", direction: "SURCHARGE", type: "PERCENT", value: 10, effectiveFrom: D(101), effectiveTo: D(105) }));
        expect(priceForCell(PITCH, at(D(100), 12))!.price).toBe(1500);
        expect(priceForCell(PITCH, at(D(101), 12))!.price).toBe(2200);
    });

    it("existing bookings keep their saved price when a temporary price is added later", async () => {
        const cell = at(D(2), 7.5).toISOString();
        const b = await createBooking(customer, { pitchId: PITCH, cellStarts: [cell], phone: "01711111111" });
        await createAdjustment(admin, adj({ label: "Late promo", type: "PRICE", value: 1000, effectiveFrom: D(2), effectiveTo: D(2) }));
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<{ subtotal: number }>();
        expect(saved?.subtotal).toBe(1800);
    });
});

describe("staff hold ↔ maintenance switch", () => {
    it("switches a staff hold to maintenance and back without creating a booking", async () => {
        const d = addDays(TODAY, 1);
        const cell = at(d, 9).toISOString();
        // (Not a total count: a customer's new attempt drops their own older unpaid hold by design.)
        await setBlock(deskStaff, { pitchId: PITCH, cellStart: cell, block: true, kind: "HELD", reason: "Walk-in group" });
        await setBlock(deskStaff, { pitchId: PITCH, cellStart: cell, block: true, kind: "MAINTENANCE", reason: "Net repair" });
        expect((await getPitchAvailability(PITCH, d)).find((c) => c.cellStart === cell)!.status).toBe("MAINTENANCE");
        await expect(createBooking(customer, { pitchId: PITCH, cellStarts: [cell], phone: "01711111111" }))
            .rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
        await setBlock(deskStaff, { pitchId: PITCH, cellStart: cell, block: false, kind: "MAINTENANCE" });
        expect((await getPitchAvailability(PITCH, d)).find((c) => c.cellStart === cell)!.status).toBe("AVAILABLE");
        expect(await BookingModel.countDocuments({ cellStarts: cell })).toBe(0); // holds never create bookings
    });

    it("a customer (non-staff) cannot manage slots", async () => {
        await expect(setBlock(customer, { pitchId: PITCH, cellStart: at(addDays(TODAY, 1), 10.5).toISOString(), block: true, kind: "HELD", reason: "Sneaky" }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
});
