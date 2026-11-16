// Temporary prices override the regular price ONLY on their dates, never change
// the regular price, and never touch saved bookings. Shown the same on /book,
// the Field card and the admin data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pitches } from "@/data/pitches";
import { priceAdjustments, pricingRules } from "@/data/pricing";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel } from "@/models";
import { createAdjustment, createPitch, createRate, deleteAdjustment, getSetupData, updateAdjustment, updateRate } from "@/server/admin/setup";
import type { ServerUser } from "@/server/auth/session";
import { getPitchAvailability } from "@/server/availability";
import { createBooking } from "@/server/bookings";
import { priceForCell } from "@/server/pricing";
import { getRateTable } from "@/server/pricing/rateTable";
import { startDb, stopDb } from "./helpers";

const admin: ServerUser = { id: "admin", name: "admin", role: "SUPER_ADMIN", phone: "01354490362", email: null, branchIds: [], permissions: [] };
const cust = (id: string): ServerUser => ({ id, name: id, role: "CUSTOMER", phone: "01711111111", email: null, branchIds: [], permissions: [] });
const ALL = [0, 1, 2, 3, 4, 5, 6];

let TODAY = "";
let F = "";
let D20 = ""; // stands in for "20 November"
let D21 = "";
const at = (date: string, h: number) => dhakaToUtc(date, Math.round(h * 60));
const noon = (date: string) => at(date, 12);
const price = (date: string, h: number) => priceForCell(F, at(date, h))!.price;
const regular = () => pricingRules.find((r) => r.pitchId === F && !r.effectiveFrom)!;
const temp = (over: Record<string, unknown>) => ({
    label: "Vacation", pitchIds: [F], effectiveFrom: D20, effectiveTo: D21, days: ALL, startTime: "00:00", endTime: "24:00",
    direction: "SURCHARGE" as const, type: "PRICE" as const, value: 2700, ...over,
});

beforeAll(async () => {
    await startDb();
    TODAY = await todayDhaka(new Date());
    D20 = addDays(TODAY, 5);
    D21 = addDays(TODAY, 6);
    pitches.splice(0);
    pricingRules.splice(0);
    priceAdjustments.splice(0);
    await createPitch(admin, {
        branchId: "bogura", name: "Main Field", sport: "Football", format: "5 vs 5", dimensions: "", surface: "",
        openTime: "00:00", closeTime: "24:00", slotMinutes: 60, maxConsecutiveSlots: 2, facilities: [], image: "", status: "ACTIVE",
    });
    F = pitches[0].id;
    await createRate(admin, {
        pitchId: F, days: ALL, startTime: "00:00", endTime: "24:00", pricePerSlot: 2200, tier: "Off-peak",
        effectiveFrom: "", effectiveTo: "", discountType: null, discountDirection: null, discountValue: null,
    });
}, 180_000);
afterAll(stopDb);

describe("৳2,200 regular + ৳2,700 temporary increase on the 20th–21st", () => {
    it("adding it does not change or delete the regular price", async () => {
        const pick = () => pricingRules.filter((r) => r.pitchId === F).map((r) => ({ id: r.id, price: r.pricePerSlot, days: r.days, s: r.startTime, e: r.endTime }));
        const before = pick();
        await createAdjustment(admin, temp({}));
        expect(pick()).toEqual(before);           // same single regular rule, untouched
        expect(regular().pricePerSlot).toBe(2200);
    });

    it("before / during / after, including the midnight boundaries (Dhaka time)", () => {
        expect(price(addDays(D20, -1), 23)).toBe(2200); // 19th, 11 PM
        expect(price(D20, 0)).toBe(2700);                // 20th, 12 AM
        expect(price(D21, 23)).toBe(2700);               // 21st, 11 PM (end date included)
        expect(price(addDays(D21, 1), 0)).toBe(2200);    // 22nd, 12 AM: back automatically
        expect(price(addDays(D21, 30), 12)).toBe(2200);
    });

    it("booking page shows ৳2,200 → ৳2,700 only on those days", async () => {
        const on = await getPitchAvailability(F, D20);
        expect(on.every((c) => c.price === 2700 && c.originalPrice === 2200 && c.hasDiscount)).toBe(true);
        const after = await getPitchAvailability(F, addDays(D21, 1));
        expect(after.every((c) => c.price === 2200 && !c.hasDiscount)).toBe(true);
    });

    it("Field card shows the price for that day", async () => {
        const card = async (date: string) => (await getRateTable(F, noon(date)))[0].offPeak!;
        expect(await card(addDays(D20, -1))).toMatchObject({ price: 2200, hasAdjustment: false });
        expect(await card(D20)).toMatchObject({ price: 2700, originalPrice: 2200, hasSurcharge: true });
        expect(await card(D21)).toMatchObject({ price: 2700 });
        expect(await card(addDays(D21, 1))).toMatchObject({ price: 2200, hasAdjustment: false });
    });

    it("admin data keeps the regular ৳2,200 and lists the temporary price separately", async () => {
        const d = await getSetupData(admin, new Date());
        expect(d.rates.find((r) => r.pitchId === F)!.pricePerSlot).toBe(2200);
        expect(d.adjustments).toEqual([expect.objectContaining({ label: "Vacation", value: 2700, effectiveFrom: D20, effectiveTo: D21 })]);
    });

    it("existing bookings keep their saved price when the temporary price changes or is removed", async () => {
        const b = await createBooking(cust("c1"), { pitchId: F, cellStarts: [at(D20, 10).toISOString()], phone: "01711111111" });
        const a = priceAdjustments.find((x) => x.label === "Vacation")!;
        await updateAdjustment(admin, { ...temp({ value: 3000 }), id: a.id });
        expect(price(D20, 10)).toBe(3000);
        await deleteAdjustment(admin, a.id);
        expect(price(D20, 10)).toBe(2200);
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<{ subtotal: number; originalSubtotal: number }>();
        expect(saved).toMatchObject({ subtotal: 2700, originalSubtotal: 2200 });
    });
});

describe("temporary reduction behaves the same", () => {
    it("৳2,200 → ৳1,700 only on its dates", async () => {
        await createAdjustment(admin, temp({ label: "Ramadan", direction: "DISCOUNT", value: 1700 }));
        expect(price(addDays(D20, -1), 12)).toBe(2200);
        expect(price(D20, 12)).toBe(1700);
        expect(price(D21, 12)).toBe(1700);
        expect(price(addDays(D21, 1), 12)).toBe(2200);
        expect((await getRateTable(F, noon(D20)))[0].offPeak).toMatchObject({ price: 1700, hasDiscount: true });
    });
});

describe("no ambiguous or incorrect prices", () => {
    it("a second temporary price that overlaps any day is refused", async () => {
        await expect(createAdjustment(admin, temp({ label: "Eid", effectiveFrom: D21, effectiveTo: addDays(D21, 2) })))
            .rejects.toMatchObject({ code: "ADJUSTMENT_OVERLAP" });
        // Back-to-back is fine.
        await createAdjustment(admin, temp({ label: "Eid", effectiveFrom: addDays(D21, 1), effectiveTo: addDays(D21, 2) }));
        expect(price(D21, 12)).toBe(1700);
        expect(price(addDays(D21, 1), 12)).toBe(2700);
    });

    it("raising the regular price above a 'new price' increase is refused (it would stop being an increase)", async () => {
        const r = regular();
        await expect(updateRate(admin, { ...r, effectiveFrom: "", effectiveTo: "", pricePerSlot: 3000, id: r.id }))
            .rejects.toMatchObject({ code: "TEMP_PRICE_CONFLICT" });
        expect(regular().pricePerSlot).toBe(2200);
    });

    it("lowering the regular price below a 'new price' reduction is refused", async () => {
        const r = regular();
        await expect(updateRate(admin, { ...r, effectiveFrom: "", effectiveTo: "", pricePerSlot: 1500, id: r.id }))
            .rejects.toMatchObject({ code: "TEMP_PRICE_CONFLICT" });
    });

    it("a regular price change that keeps every temporary price valid is allowed", async () => {
        const r = regular();
        await updateRate(admin, { ...r, effectiveFrom: "", effectiveTo: "", pricePerSlot: 2300, id: r.id });
        expect(price(addDays(D20, -1), 12)).toBe(2300);
        expect(price(D20, 12)).toBe(1700);                 // reduction still applies
        expect(price(addDays(D21, 1), 12)).toBe(2700);     // increase still applies
    });

    it("a temporary price that has already ended never blocks regular price edits", async () => {
        priceAdjustments.push({
            id: "old", label: "Last year", pitchIds: [F], effectiveFrom: addDays(TODAY, -40), effectiveTo: addDays(TODAY, -30),
            days: ALL, startTime: "00:00", endTime: "24:00", direction: "SURCHARGE", type: "PRICE", value: 2400,
        });
        const r = regular();
        await updateRate(admin, { ...r, effectiveFrom: "", effectiveTo: "", pricePerSlot: 2500, id: r.id });
        expect(regular().pricePerSlot).toBe(2500);
    });
});
