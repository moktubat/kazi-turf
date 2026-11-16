// Optional discount on a Regular Price, and how it combines with temporary prices.
// Rule: a slot gets ONE change only. Temporary increase -> the increase (discount paused).
// Temporary reduction -> whichever is lower for the customer. Never both, never ≤ ৳0.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { pitches } from "@/data/pitches";
import { priceAdjustments, pricingRules } from "@/data/pricing";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel } from "@/models";
import { rateSchema } from "@/schemas/setup";
import { createAdjustment, createPitch, createRate, updateRate } from "@/server/admin/setup";
import type { ServerUser } from "@/server/auth/session";
import { getPitchAvailability } from "@/server/availability";
import { createBooking } from "@/server/bookings";
import { priceForCell } from "@/server/pricing";
import { getRateTable } from "@/server/pricing/rateTable";
import type { PricingRule } from "@/types";
import { startDb, stopDb } from "./helpers";

const admin: ServerUser = { id: "admin", name: "admin", role: "SUPER_ADMIN", phone: "01354490362", email: null, branchIds: [], permissions: [] };
const staff = (permissions: string[]): ServerUser => ({ id: "s", name: "s", role: "STAFF", phone: "01354490363", email: null, branchIds: ["bogura"], permissions });
const cust: ServerUser = { id: "c1", name: "c1", role: "CUSTOMER", phone: "01711111111", email: null, branchIds: [], permissions: [] };
const ALL = [0, 1, 2, 3, 4, 5, 6];

let TODAY = "";
let F = "";
const day = (n: number) => addDays(TODAY, n);
const at = (date: string, h: number) => dhakaToUtc(date, h * 60);
const pay = (date: string, h: number) => priceForCell(F, at(date, h))!.price;
const rule = (start: string) => pricingRules.find((r) => r.pitchId === F && r.startTime === start)!;
const asInput = (r: PricingRule, over: Partial<PricingRule> = {}) => ({
    ...r, effectiveFrom: "", effectiveTo: "", ...over, id: r.id,
});
const regular = (over: Record<string, unknown>) => ({
    pitchId: F, days: ALL, startTime: "00:00", endTime: "12:00", pricePerSlot: 2000, tier: "Off-peak" as const,
    effectiveFrom: "", effectiveTo: "", discountType: null, discountDirection: null, discountValue: null, ...over,
});
const temp = (over: Record<string, unknown>) => ({
    label: "Temp", pitchIds: [F], effectiveFrom: "", effectiveTo: "", days: ALL, startTime: "00:00", endTime: "24:00",
    direction: "DISCOUNT" as const, type: "PERCENT" as const, value: 10, ...over,
});

beforeAll(async () => {
    await startDb();
    TODAY = await todayDhaka(new Date());
    pitches.splice(0);
    pricingRules.splice(0);
    priceAdjustments.splice(0);
    await createPitch(admin, {
        branchId: "bogura", name: "Discount Field", sport: "Football", format: "5 vs 5", dimensions: "", surface: "",
        openTime: "00:00", closeTime: "24:00", slotMinutes: 60, maxConsecutiveSlots: 2, facilities: [], image: "", status: "ACTIVE",
    });
    F = pitches.find((p) => p.name === "Discount Field")!.id;
    // Morning: ৳2,000 with 10% off. Afternoon/evening: ৳2,500 with ৳200 off.
    await createRate(admin, regular({ discountType: "PERCENT", discountDirection: "DISCOUNT", discountValue: 10 }));
    await createRate(admin, regular({ startTime: "12:00", endTime: "24:00", pricePerSlot: 2500, discountType: "FIXED", discountDirection: "DISCOUNT", discountValue: 200 }));
}, 180_000);
afterAll(stopDb);

describe("discount on a regular price", () => {
    it("percentage: ৳2,000 − 10% = ৳1,800, shown with the original price", async () => {
        expect(priceForCell(F, at(day(1), 10))).toMatchObject({ price: 1800, originalPrice: 2000, hasDiscount: true });
        const cell = (await getPitchAvailability(F, day(1))).find((c) => c.start === "10:00")!;
        expect(cell).toMatchObject({ price: 1800, originalPrice: 2000, hasDiscount: true });
    });

    it("fixed amount: ৳2,500 − ৳200 = ৳2,300", () => {
        expect(priceForCell(F, at(day(1), 14))).toMatchObject({ price: 2300, originalPrice: 2500 });
    });

    it("only the slots of that price get its discount (overlapping windows are refused as before)", async () => {
        expect(pay(day(1), 11)).toBe(1800); // last morning slot: 10%
        expect(pay(day(1), 12)).toBe(2300); // first afternoon slot: ৳200 off, not 10%
        await expect(createRate(admin, regular({ startTime: "10:00", endTime: "14:00", discountType: "PERCENT", discountDirection: "DISCOUNT", discountValue: 50 })))
            .rejects.toMatchObject({ code: "RATE_OVERLAP" });
    });

    it("the Field card shows the discounted price with the original", async () => {
        const [row] = await getRateTable(F, at(day(1), 12));
        expect(row.windows).toMatchObject([
            { start: "00:00", price: 1800, originalPrice: 2000, hasDiscount: true },
            { start: "12:00", price: 2300, originalPrice: 2500, hasDiscount: true, window: "12:00 PM–12:00 AM" },
        ]);
    });
});

describe("validation (the same schema runs on the server for every save)", () => {
    const parse = (o: Record<string, unknown>) => rateSchema.safeParse(regular(o));
    const msg = (o: Record<string, unknown>) => {
        const r = parse(o);
        return r.success ? null : r.error.issues.find((i) => i.path[0] === "discountValue")?.message ?? r.error.issues[0].message;
    };
    it("percentage must be 1–90", () => {
        expect(msg({ discountType: "PERCENT", discountDirection: "DISCOUNT", discountValue: 90 })).toBeNull();
        expect(msg({ discountType: "PERCENT", discountDirection: "DISCOUNT", discountValue: 91 })).toMatch(/1–90%/);
        expect(msg({ discountType: "PERCENT", discountDirection: "DISCOUNT", discountValue: 0 })).toBeTruthy();
    });
    it("the price after the discount can never drop below ৳100 (so never ৳0 or negative)", () => {
        expect(msg({ pricePerSlot: 250, discountType: "FIXED", discountDirection: "DISCOUNT", discountValue: 150 })).toBeNull(); // ৳100
        expect(msg({ pricePerSlot: 250, discountType: "FIXED", discountDirection: "DISCOUNT", discountValue: 151 })).toMatch(/at least ৳100/);
        expect(msg({ pricePerSlot: 250, discountType: "FIXED", discountDirection: "DISCOUNT", discountValue: 300 })).toMatch(/at least ৳100/);
        expect(msg({ pricePerSlot: 100, discountType: "PERCENT", discountDirection: "DISCOUNT", discountValue: 10 })).toMatch(/at least ৳100/);
    });
    it("a type without a value is refused; text or fractions are refused", () => {
        expect(msg({ discountType: "FIXED", discountDirection: "DISCOUNT", discountValue: null })).toBeTruthy();
        expect(parse({ discountType: "FIXED", discountDirection: "DISCOUNT", discountValue: 12.5 }).success).toBe(false);
        expect(parse({ discountType: "FIXED", discountDirection: "DISCOUNT", discountValue: "200" }).success).toBe(false);
    });
});

describe("who can manage discounts", () => {
    it("staff need pitches.edit for the field's branch, like any regular price change", async () => {
        const r = rule("00:00");
        await expect(updateRate(staff([]), asInput(r, { discountValue: 20 }))).rejects.toMatchObject({ code: "FORBIDDEN" });
        await updateRate(staff(["pitches.edit"]), asInput(r, { discountValue: 20 }));
        expect(pay(day(1), 10)).toBe(1600);
        await updateRate(admin, asInput(rule("00:00"), { discountValue: 10 })); // back to 10%
        expect(pay(day(1), 10)).toBe(1800);
    });
});

describe("together with temporary prices (one change only, never stacked)", () => {
    beforeAll(async () => {
        await createAdjustment(admin, temp({ label: "Vacation", direction: "SURCHARGE", type: "PRICE", value: 2700, effectiveFrom: day(5), effectiveTo: day(6), endTime: "12:00" }));
        await createAdjustment(admin, temp({ label: "Small cut", value: 5, effectiveFrom: day(8), effectiveTo: day(8) }));
        await createAdjustment(admin, temp({ label: "Big cut", value: 30, effectiveFrom: day(9), effectiveTo: day(9) }));
        await createAdjustment(admin, temp({ label: "Evening ৳300 off", type: "FIXED", value: 300, effectiveFrom: day(10), effectiveTo: day(10), startTime: "12:00" }));
    });

    it("temporary increase: the increase is charged, the discount pauses, and comes back afterwards", () => {
        expect(pay(day(5), 10)).toBe(2700);
        expect(pay(day(6), 10)).toBe(2700);
        expect(pay(day(7), 10)).toBe(1800); // discount again
        expect(pay(day(5), 14)).toBe(2300); // afternoon not covered by the increase: its own discount
    });

    it("temporary reduction smaller than the discount: the lower price (the regular discount) is kept", () => {
        expect(pay(day(8), 10)).toBe(1800); // not ৳1,900 (5% off ৳2,000), not ৳1,710 (both)
    });

    it("temporary reduction bigger than the discount: the reduction, applied once to the regular price", () => {
        expect(pay(day(9), 10)).toBe(1400); // 30% off ৳2,000; stacking would give ৳1,260
        expect(pay(day(9), 14)).toBe(1750); // 30% off ৳2,500 beats ৳200 off
    });

    it("fixed temporary reduction vs fixed discount", () => {
        expect(pay(day(10), 14)).toBe(2200); // ৳2,500 − ৳300 (not − ৳500)
        expect(pay(day(10), 10)).toBe(1800); // morning not covered: its own 10%
    });

    it("the booking page and the Field card agree with the booking price", async () => {
        const cell = (await getPitchAvailability(F, day(9))).find((c) => c.start === "10:00")!;
        expect(cell).toMatchObject({ price: 1400, originalPrice: 2000 });
        const card = async (d: string) => (await getRateTable(F, at(d, 12)))[0].windows.find((w) => w.start === "12:00")!.price;
        expect(await card(day(8))).toBe(2300); // 5% day: ৳200 off is lower than 5% off ৳2,500 (৳2,375), so it stays
        expect(await card(day(9))).toBe(1750); // 30% day: the reduction
        expect(pay(day(9), 14)).toBe(1750);    // same as the booking engine
    });
});

describe("turning the discount off, and saved bookings", () => {
    it("existing bookings keep their saved price when the discount changes or is removed", async () => {
        const b = await createBooking(cust, { pitchId: F, cellStarts: [at(day(2), 10).toISOString()], phone: "01711111111" });
        await updateRate(admin, asInput(rule("00:00"), { discountValue: 50 }));
        expect(pay(day(2), 10)).toBe(1000);
        await updateRate(admin, asInput(rule("00:00"), { discountType: null, discountDirection: null, discountValue: null }));
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<{ subtotal: number; originalSubtotal: number }>();
        expect(saved).toMatchObject({ subtotal: 1800, originalSubtotal: 2000 });
    });

    it("disabled discount: the regular price applies again and nothing half-set is stored", async () => {
        expect(pay(day(2), 10)).toBe(2000);
        expect(priceForCell(F, at(day(2), 10))).toMatchObject({ hasDiscount: false, originalPrice: 2000 });
        expect(rule("00:00")).toMatchObject({ discountType: null, discountDirection: null, discountValue: null });

        // A type sent with no value (e.g. a half-cleared form) is stored as "no discount" by the server.
        await updateRate(admin, asInput(rule("00:00"), { discountType: "PERCENT", discountDirection: "DISCOUNT", discountValue: null }));
        expect(rule("00:00")).toMatchObject({ discountType: null, discountDirection: null, discountValue: null });
        expect(pay(day(2), 10)).toBe(2000);
    });
});
