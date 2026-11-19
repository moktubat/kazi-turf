// Setup → Policies: day and night advance can be any whole percentage from 1 to 100
// (no fixed 30–50 / 50–100 ranges). Saved values drive the quote and the public copy.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getHowSteps } from "@/data/home";
import { pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { policySchema } from "@/schemas/setup";
import { getPolicyForm, updatePolicies } from "@/server/admin/setup";
import type { ServerUser } from "@/server/auth/session";
import { quote } from "@/server/pricing";
import { resetDb, startDb, stopDb } from "./helpers";

const admin: ServerUser = { id: "admin", name: "admin", role: "SUPER_ADMIN", phone: "01354490362", email: null, branchIds: [], permissions: [] };

describe("policy schema: advance percentages", () => {
    const form = () => ({ ...getPolicyForm() });

    it.each([1, 25, 40, 45, 60, 75, 100])("accepts %i%% for day and night", (n) => {
        const r = policySchema.safeParse({ ...form(), advancePercent: n, nightAdvancePercent: n });
        expect(r.success).toBe(true);
    });

    it("accepts a night advance lower than the day advance", () => {
        expect(policySchema.safeParse({ ...form(), advancePercent: 75, nightAdvancePercent: 40 }).success).toBe(true);
    });

    it.each([0, -5, 101, 45.5])("rejects %s", (n) => {
        expect(policySchema.safeParse({ ...form(), advancePercent: n }).success).toBe(false);
        expect(policySchema.safeParse({ ...form(), nightAdvancePercent: n }).success).toBe(false);
    });

    it("explains the rule in the error", () => {
        const r = policySchema.safeParse({ ...form(), advancePercent: 0 });
        expect(r.success).toBe(false);
        expect(r.error!.issues[0].message).toBe("At least 1%");
        const r2 = policySchema.safeParse({ ...form(), nightAdvancePercent: 150 });
        expect(r2.error!.issues[0].message).toBe("At most 100%");
    });
});

describe("saved percentages drive the quote", () => {
    let day = "";
    beforeAll(async () => {
        await startDb();
        day = addDays(await todayDhaka(new Date()), 1);
    }, 180_000);
    beforeEach(resetDb);
    afterAll(stopDb);

    it("day 75% and night 40% are saved and used", async () => {
        await updatePolicies(admin, { ...getPolicyForm(), advancePercent: 75, nightAdvancePercent: 40 });
        expect(getPolicyForm()).toMatchObject({ advancePercent: 75, nightAdvancePercent: 40 });

        const dayQ = quote("bogura-a", [dhakaToUtc(day, 18 * 60)]);   // 6 PM: day
        expect(dayQ.advancePercent).toBe(75);
        expect(dayQ.advance).toBe(Math.round(dayQ.total * 0.75));

        // Fixture prices start at 06:00; add a 12–6 AM price so the night slot can be quoted.
        pricingRules.push({
            id: "bogura-a-night", pitchId: "bogura-a", days: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "06:00",
            pricePerSlot: 2000, tier: "Off-peak", discountType: null, discountDirection: null, discountValue: null,
        });
        const nightQ = quote("bogura-a", [dhakaToUtc(day, 3 * 60)]);  // 3 AM: night
        expect(nightQ.advancePercent).toBe(40);
        expect(nightQ.advance).toBe(Math.round(nightQ.total * 0.4));
    });

    it("a 1% advance never rounds down to ৳0", () => {
        Object.assign(policies, { advancePercent: 1 });
        const q = quote("bogura-a", [dhakaToUtc(day, 18 * 60)]);
        expect(q.advance).toBeGreaterThanOrEqual(1);
        expect(q.advance).toBeLessThanOrEqual(q.total);
    });
});

// The advance is now set per sport, so the home page names no fixed percentage at all.
describe("home page wording names no fixed advance percentage", () => {
    const payText = () => getHowSteps().find((s) => s.id === "pay")!.text;

    it.each([[30, 100], [45, 60], [40, 40]])("day %i%% / night %i%%: generic wording, live hold time", (day, night) => {
        Object.assign(policies, { advancePercent: day, nightAdvancePercent: night, holdMinutes: 10 });
        expect(payText()).toContain("advance required for your sport");
        expect(payText()).toContain("held for 10 minutes");
        expect(payText()).not.toMatch(/\d+%/);
    });
});
