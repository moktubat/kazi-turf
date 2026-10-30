// Setup edits persist to MongoDB, reach other instances, and respect permissions.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { AuditLogModel, ConfigModel } from "@/models";
import { deleteRate, getPolicyForm, updatePolicies } from "@/server/admin/setup";
import type { ServerUser } from "@/server/auth/session";
import { ensureConfig } from "@/server/config";
import { resetDb, startDb, stopDb } from "./helpers";

const mk = (id: string, role: ServerUser["role"], branchIds: string[], permissions: string[] = []): ServerUser => ({
    id, name: id, role, phone: "01700000000", email: null, branchIds, permissions,
});
const admin = mk("admin", "SUPER_ADMIN", []);

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(resetDb);

describe("persistent Setup", () => {
    it("saves policies to the database and reloads them on a stale instance", async () => {
        await updatePolicies(admin, { ...getPolicyForm(), advancePercent: 35, holdMinutes: 12 });

        policies.advancePercent = 50; // simulate another instance still holding old values
        await ensureConfig(true);

        expect(policies.advancePercent).toBe(35);
        expect(policies.holdMinutes).toBe(12);
        expect(await AuditLogModel.countDocuments({ action: "POLICY_CHANGED" })).toBe(1);
    });

    it("staff need pitches.edit, and only for their own branches", async () => {
        const id = pricingRules[0].id; // a Bogura rate
        await expect(deleteRate(mk("s1", "STAFF", ["bogura"]), id)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(deleteRate(mk("s2", "STAFF", ["dhaka"], ["pitches.edit"]), id)).rejects.toMatchObject({ code: "FORBIDDEN" });

        const before = pricingRules.length;
        await deleteRate(mk("s3", "STAFF", ["bogura"], ["pitches.edit"]), id);

        const saved = await ConfigModel.findOne({ key: "pricingRules" }).lean<any>();
        expect(saved.value).toHaveLength(before - 1);
        expect(await AuditLogModel.countDocuments({ action: "PRICE_CHANGED" })).toBe(1);
    });
});