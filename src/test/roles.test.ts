// Admin vs Staff: every write a Staff member is supposed to be allowed must work for Staff,
// and every Super-Admin-only write must still be refused. Self-contained data.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// revalidatePath needs a live Next request; the permission logic under test does not.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
import { pitches } from "@/data/pitches";
import { priceAdjustments, pricingRules } from "@/data/pricing";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { UserModel } from "@/models";
import { getBoard } from "@/server/admin/board";
import { cancelBooking, checkIn, collectBalance, recordRefund, setBlock } from "@/server/admin/operations";
import {
    createAdjustment, createPitch, createRate, createStaff, deleteAdjustment, deleteRate, getPolicyForm, getSetupData,
    updateBranch, updatePitch, updatePolicies, updateRate,
} from "@/server/admin/setup";
import { branches } from "@/data/branches";
import { createWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import { changePassword, updateProfile } from "@/server/auth/users";
import { hashPassword } from "@/server/auth/password";
import { startDb, stopDb } from "./helpers";

const mk = (id: string, role: ServerUser["role"], branchIds: string[], permissions: string[] = []): ServerUser => ({
    id, name: id, role, phone: `0171${id.length}000000`.slice(0, 11), email: null, branchIds, permissions,
});
// Same shapes the app creates: a Super Admin may have ["*"]; StaffTab sends [venue.id] + optional pitches.edit.
const admin = mk("admin", "SUPER_ADMIN", [], ["*"]);
const editor = mk("editor", "STAFF", ["bogura"], ["pitches.edit"]);
const desk = mk("desk", "STAFF", ["bogura"]);

let TODAY = "";
let PITCH = "";
const ALL = [0, 1, 2, 3, 4, 5, 6];
const at = (h: number) => dhakaToUtc(addDays(TODAY, 1), h * 60).toISOString();
const field = (name: string, over: Record<string, unknown> = {}) => ({
    branchId: "bogura", name, sport: "Football", format: "5 vs 5", dimensions: "", surface: "",
    openTime: "00:00" as const, closeTime: "24:00" as const, slotMinutes: 90, maxConsecutiveSlots: 2,
    facilities: [], image: "", status: "ACTIVE" as const, ...over,
});
const rate = (over: Record<string, unknown> = {}) => ({
    pitchId: PITCH, days: ALL, startTime: "00:00", endTime: "24:00", pricePerSlot: 2000, tier: "Off-peak" as const,
    effectiveFrom: "", effectiveTo: "", discountType: null, discountDirection: null, discountValue: null, ...over,
});

beforeAll(async () => {
    await startDb();
    TODAY = await todayDhaka(new Date());
    pitches.splice(0);
    pricingRules.splice(0);
    priceAdjustments.splice(0);
    for (const u of [admin, editor, desk]) {
        await UserModel.create({ ...u, passwordHash: await hashPassword("Old-Pass#12345"), status: "ACTIVE", createdAt: new Date().toISOString() });
    }
}, 180_000);
afterAll(stopDb);

describe("Setup writes (Super Admin, or Staff with pitches.edit)", () => {
    it("fields: create + update (incl. photo) for admin and editor", async () => {
        await createPitch(admin, field("Admin Field"));
        await createPitch(editor, field("Editor Field"));
        PITCH = pitches.find((p) => p.name === "Editor Field")!.id;
        await updatePitch(editor, { ...field("Editor Field", { image: "/sports/football.jpg" }), id: PITCH });
        expect(pitches.find((p) => p.id === PITCH)!.image).toBe("/sports/football.jpg");
        const a = pitches.find((p) => p.name === "Admin Field")!;
        await updatePitch(admin, { ...field("Admin Field", { surface: "Turf" }), id: a.id });
    });

    it("slot prices: create, update, delete for editor and admin", async () => {
        await createRate(editor, rate({ startTime: "00:00", endTime: "12:00" }));
        const r = pricingRules.find((x) => x.pitchId === PITCH)!;
        await updateRate(editor, { ...rate({ startTime: "00:00", endTime: "12:00", pricePerSlot: 2100 }), id: r.id });
        await createRate(admin, rate({ startTime: "12:00", endTime: "24:00" }));
        await deleteRate(editor, pricingRules.find((x) => x.pitchId === PITCH && x.startTime === "12:00")!.id);
        await createRate(editor, rate({ startTime: "12:00", endTime: "24:00" }));
    });

    it("seasonal prices: editor can add and remove", async () => {
        await createAdjustment(editor, {
            label: "Exams", pitchIds: [PITCH], effectiveFrom: addDays(TODAY, 3), effectiveTo: addDays(TODAY, 4),
            days: ALL, startTime: "00:00", endTime: "24:00", direction: "DISCOUNT", type: "PERCENT", value: 10,
        });
        await deleteAdjustment(editor, priceAdjustments[0].id);
    });

    it("Setup page data loads for the editor", async () => {
        const d = await getSetupData(editor, new Date());
        expect(d.tabs).toEqual(["pitches", "rates"]);
        expect(d.pitches.map((p) => p.id)).toContain(PITCH);
    });

    it("desk Staff (no pitches.edit) is still refused Setup writes", async () => {
        await expect(createPitch(desk, field("Nope"))).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(createRate(desk, rate({ startTime: "00:00", endTime: "01:30", effectiveFrom: addDays(TODAY, 9), effectiveTo: addDays(TODAY, 9) })))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Super-Admin-only writes still refuse every Staff member", async () => {
        await expect(updatePolicies(editor, getPolicyForm())).rejects.toMatchObject({ code: "FORBIDDEN" });
        await updatePolicies(admin, getPolicyForm());

        const venue = { ...branches[0], touchedSportIds: [] };
        await expect(updateBranch(editor, venue)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await updateBranch(admin, venue);

        const newStaff = {
            name: "New Staff", phone: "01799990000", email: "", password: "Strong-Pass#123",
            role: "STAFF" as const, branchIds: ["bogura"], permissions: [] as "pitches.edit"[],
        };
        await expect(createStaff(editor, newStaff)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await createStaff(admin, newStaff);
    });

    it("Setup tabs: Admin gets all five, Staff editor only Fields + Slots", async () => {
        expect((await getSetupData(admin, new Date())).tabs).toEqual(["venue", "pitches", "rates", "staff", "policies"]);
        expect((await getSetupData(editor, new Date())).tabs).toEqual(["pitches", "rates"]);
        await expect(getSetupData(desk, new Date())).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
});

describe("Staff Desk writes (any Staff of the venue)", () => {
    it("walk-in, collect balance, check-in, cancel, hold/maintenance", async () => {
        for (const [i, u] of [desk, editor, admin].entries()) {
            const wi = await createWalkIn(u, { pitchId: PITCH, cellStarts: [at(7.5 + i * 4.5)], phone: "01733334444", name: "Karim", cashReceived: 1000 });
            await collectBalance(u, wi.code);
            const wi2 = await createWalkIn(u, { pitchId: PITCH, cellStarts: [at(9 + i * 4.5)], phone: "01733334444", name: "Karim", cashReceived: 1000 });
            await checkIn(u, wi2.code, { identity: { method: "NAME" }, collectBalance: false, overrideReason: "Testing early arrival" });
            const wi3 = await createWalkIn(u, { pitchId: PITCH, cellStarts: [at(10.5 + i * 4.5)], phone: "01733334444", name: "Karim", cashReceived: 1000 });
            await cancelBooking(u, wi3.code, "Customer called to cancel");
            // Refunds stay Super Admin only.
            if (u.role === "SUPER_ADMIN") await recordRefund(u, wi3.code, undefined);
            else await expect(recordRefund(u, wi3.code, undefined)).rejects.toMatchObject({ code: "FORBIDDEN" });

            await setBlock(u, { pitchId: PITCH, cellStart: at(22.5), block: true, kind: "HELD", reason: "Friends" });
            await setBlock(u, { pitchId: PITCH, cellStart: at(22.5), block: false, kind: "HELD" });
            expect((await getBoard(u, "bogura", addDays(TODAY, 1))).pitches.length).toBeGreaterThan(0);
        }
    });
});

describe("Own account (every role)", () => {
    it("profile and password updates work for Staff and Admin", async () => {
        for (const [i, u] of [desk, editor, admin].entries()) {
            const res = await updateProfile(u.id, { name: `${u.id} renamed`, phone: `0175555000${i}`, email: "" });
            expect(res.name).toBe(`${u.id} renamed`);
            await changePassword(u.id, "Old-Pass#12345", "New-Pass#12345!");
        }
    });
});
