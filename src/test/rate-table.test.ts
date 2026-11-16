// Field card price table: EVERY time window with its own regular price is listed (it used
// to keep only one per weekday group), with discounts and temporary prices applied exactly
// like the booking engine.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { pitches } from "@/data/pitches";
import { priceAdjustments, pricingRules } from "@/data/pricing";
import { addDays, dhakaParts, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { createAdjustment, createPitch, createRate } from "@/server/admin/setup";
import type { ServerUser } from "@/server/auth/session";
import { priceForCell } from "@/server/pricing";
import { getRateTable, periodOf } from "@/server/pricing/rateTable";
import { startDb, stopDb } from "./helpers";

const admin: ServerUser = { id: "admin", name: "admin", role: "SUPER_ADMIN", phone: "01354490362", email: null, branchIds: [], permissions: [] };
const SUN_THU = [0, 1, 2, 3, 4];
const FRI_SAT = [5, 6];
const ALL = [0, 1, 2, 3, 4, 5, 6];

let TODAY = "";
let F = "";
const day = (n: number) => addDays(TODAY, n);
const at = (date: string, h: number) => dhakaToUtc(date, h * 60);
const table = (date: string) => getRateTable(F, at(date, 12));
const rate = (days: number[], startTime: string, endTime: string, pricePerSlot: number, over: Record<string, unknown> = {}) =>
    createRate(admin, {
        pitchId: F, days, startTime, endTime, pricePerSlot, tier: "Off-peak",
        effectiveFrom: "", effectiveTo: "", discountType: null, discountDirection: null, discountValue: null, ...over,
    });
const temp = (over: Record<string, unknown>) =>
    createAdjustment(admin, {
        label: "Temp", pitchIds: [F], effectiveFrom: "", effectiveTo: "", days: SUN_THU, startTime: "00:00", endTime: "24:00",
        direction: "DISCOUNT", type: "PERCENT", value: 10, ...over,
    });
/** First date on or after `from` whose Dhaka weekday is Sun–Thu. */
const weekdayFrom = (from: number) => {
    for (let n = from; ; n++) if (SUN_THU.includes(dhakaParts(at(day(n), 12)).dow)) return day(n);
};

beforeAll(async () => {
    await startDb();
    TODAY = await todayDhaka(new Date());
    pitches.splice(0);
    pricingRules.splice(0);
    priceAdjustments.splice(0);
    await createPitch(admin, {
        branchId: "bogura", name: "Window Field", sport: "Football", format: "5 vs 5", dimensions: "", surface: "",
        openTime: "00:00", closeTime: "24:00", slotMinutes: 60, maxConsecutiveSlots: 2, facilities: [], image: "", status: "ACTIVE",
    });
    F = pitches.find((p) => p.name === "Window Field")!.id;
    // Created out of order on purpose: the table must sort them.
    await rate(SUN_THU, "17:00", "24:00", 2000);
    await rate(SUN_THU, "06:00", "12:00", 1500);
    await rate(SUN_THU, "12:00", "17:00", 1800, { discountType: "FIXED", discountDirection: "DISCOUNT", discountValue: 200 });
    await rate(FRI_SAT, "06:00", "24:00", 2200);
    await rate(ALL, "00:00", "06:00", 1200);
}, 180_000);
afterAll(stopDb);

describe("several regular prices on the same weekdays", () => {
    it("lists every window, earliest first, grouped by weekdays in week order", async () => {
        const rows = await table(day(1));
        expect(rows.map((r) => r.days)).toEqual(["Every day", "Sun–Thu", "Fri–Sat"]);
        expect(rows[1].windows.map((w) => [w.period, w.window, w.price])).toEqual([
            ["Morning", "06:00 AM–12:00 PM", 1500],
            ["Afternoon", "12:00 PM–05:00 PM", 1600],
            ["Evening", "05:00 PM–12:00 AM", 2000],
        ]);
        expect(rows[0].windows).toMatchObject([{ period: "Night", price: 1200 }]);
        expect(rows[2].windows).toMatchObject([{ period: "Morning", price: 2200, window: "06:00 AM–12:00 AM" }]);
    });

    it("shows a discount with the regular price and the final customer price", async () => {
        const afternoon = (await table(day(1)))[1].windows[1];
        expect(afternoon).toMatchObject({ price: 1600, originalPrice: 1800, hasDiscount: true, hasSurcharge: false });
    });

    it("every listed price is exactly what booking charges for that window", async () => {
        const d = weekdayFrom(1);
        const rows = await table(d);
        for (const w of rows.find((r) => r.days === "Sun–Thu")!.windows) {
            const h = Number(w.start.slice(0, 2));
            expect(priceForCell(F, at(d, h))!.price, w.window).toBe(w.price);
        }
    });

    it("period labels follow the start time", () => {
        expect(["00:00", "04:30", "05:00", "11:30", "12:00", "16:30", "17:00", "20:30", "21:00"].map(periodOf)).toEqual([
            "Night", "Night", "Morning", "Morning", "Afternoon", "Afternoon", "Evening", "Evening", "Night",
        ]);
    });
});

describe("temporary prices on the Field card (unchanged rules)", () => {
    beforeAll(async () => {
        await temp({ label: "Event", direction: "SURCHARGE", type: "PRICE", value: 2500, effectiveFrom: day(5), effectiveTo: day(5), startTime: "17:00" });
        await temp({ label: "Quiet afternoons", value: 20, effectiveFrom: day(6), effectiveTo: day(6), startTime: "12:00", endTime: "17:00" });
        await temp({ label: "Early bird", value: 50, effectiveFrom: day(7), effectiveTo: day(7), startTime: "06:00", endTime: "09:00" });
    });

    it("an increase covering one window changes only that window", async () => {
        const w = (await table(day(5)))[1].windows;
        expect(w.map((x) => x.price)).toEqual([1500, 1600, 2500]);
        expect(w[2]).toMatchObject({ originalPrice: 2000, hasSurcharge: true });
    });

    it("a reduction beats a smaller regular discount, never stacked", async () => {
        const afternoon = (await table(day(6)))[1].windows[1];
        expect(afternoon).toMatchObject({ price: 1440, originalPrice: 1800 }); // 20% off ৳1,800, not ৳1,600 − 20%
    });

    it("a reduction covering only part of a window keeps the window's regular price on the card", async () => {
        expect((await table(day(7)))[1].windows[0]).toMatchObject({ price: 1500, hasAdjustment: false });
    });

    it("after the temporary dates everything is back to normal", async () => {
        expect((await table(day(8)))[1].windows.map((x) => x.price)).toEqual([1500, 1600, 2000]);
    });
});

describe("older date-limited prices", () => {
    it("on its dates it replaces the always-on window it overlaps (listed once), then disappears", async () => {
        await rate(SUN_THU, "17:00", "24:00", 2100, { effectiveFrom: day(10), effectiveTo: day(10) });
        const on = (await table(day(10)))[1].windows;
        expect(on.filter((w) => w.period === "Evening")).toMatchObject([{ price: 2100 }]);
        expect(on).toHaveLength(3);
        expect((await table(day(11)))[1].windows.map((x) => x.price)).toEqual([1500, 1600, 2000]);
    });
});
