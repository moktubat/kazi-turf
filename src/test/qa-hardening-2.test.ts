// QA round 2 (2026-11-22): staff money edits, re-check-in, staff re-authentication, reset-link
// retirement, password-hash upgrade, image deletion, client IP and the shared rate limiter.
// Real MongoDB (in-memory replica set); Cloudinary deletion is spied on, never called for real.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
// The provider accepts every email (a reset link whose email is NOT accepted is withdrawn).
vi.mock("@/server/email", () => ({ sendEmail: async () => ({ id: "test", attempts: 1 }) }));
vi.mock("@/server/cloudinary", async (orig) => ({ ...(await orig<typeof import("@/server/cloudinary")>()), deleteImage: vi.fn(async () => undefined) }));

import { NextRequest } from "next/server";
import { randomBytes, scryptSync } from "crypto";
import { pitches } from "@/data/pitches";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, ResetTokenModel, UserModel } from "@/models";
import { checkIn, undoCheckIn, updateAdditionalCharge, updateDiscount } from "@/server/admin/operations";
import { updatePitch } from "@/server/admin/setup";
import { createWalkIn, quoteWalkIn } from "@/server/admin/walkin";
import { checkPassword, hashPassword, verifyPassword } from "@/server/auth/password";
import { consumePasswordReset, requestPasswordReset } from "@/server/auth/resetToken";
import type { ServerUser } from "@/server/auth/session";
import { authenticate } from "@/server/auth/users";
import { deleteImage } from "@/server/cloudinary";
import { clientIp } from "@/server/http";
import { sharedRateLimit } from "@/server/security/sharedRateLimit";
import type { Booking } from "@/types/booking";
import { startDb, stopDb } from "./helpers";

const mk = (id: string, role: ServerUser["role"], branchIds: string[] = []): ServerUser => ({
    id, name: id, role, phone: "01354490362", email: null, branchIds, permissions: [],
});
const staff = mk("staff-bogura", "STAFF", ["bogura"]);
const admin = mk("admin", "SUPER_ADMIN");
const NAME_ID = { identity: { method: "NAME" as const }, collectBalance: false };

let cell: (dayOffset: number, h: number) => string;
beforeAll(async () => {
    await startDb();
    const today = await todayDhaka(new Date());
    cell = (d: number, h: number) => dhakaToUtc(addDays(today, d), h * 60).toISOString();
}, 180_000);
afterAll(stopDb);

let slot = 0;
/** A fresh walk-in on its own cell. `cash` = what was paid at the counter. */
async function walkIn(cash: number | "FULL") {
    // Fixture fields use 90-minute slots from midnight: 06:00, 07:30 … 21:00 (priced hours).
    const c = cell(2 + Math.floor(slot / 10), 6 + (slot++ % 10) * 1.5);
    const q = await quoteWalkIn(staff, "bogura-b", [c]);
    return createWalkIn(staff, { pitchId: "bogura-b", cellStarts: [c], phone: "01755556666", name: "Karim", cashReceived: cash === "FULL" ? q.total : cash });
}

describe("staff cannot discount away money that is owed or already paid", () => {
    it("part-paid: a counter discount that still leaves a balance is fine for staff", async () => {
        const b = await walkIn(500);
        const r = await updateDiscount(staff, b.code, { type: "FIXED", value: 100 });
        expect(r).toMatchObject({ discountAmount: 100, total: b.total - 100, balanceDue: b.total - 600, paymentStatus: "PARTIALLY_PAID" });
    });

    it("part-paid: staff cannot discount the balance down to ৳0 (Super Admin can)", async () => {
        const b = await walkIn(500);
        const toZero = { type: "FIXED" as const, value: b.total - 500 };
        await expect(updateDiscount(staff, b.code, toZero)).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED", status: 403, fields: { discount: expect.any(String) } });
        await expect(updateDiscount(staff, b.code, { type: "PERCENT", value: 100 })).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED" });
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        expect(saved).toMatchObject({ total: b.total, balanceAmount: b.total - 500 });
        expect(await updateDiscount(admin, b.code, toZero)).toMatchObject({ balanceDue: 0, paymentStatus: "PAID" });
    });

    it("fully paid: staff cannot lower the total at all; a Super Admin can", async () => {
        const b = await walkIn("FULL");
        expect(b.paymentStatus).toBe("PAID");
        await expect(updateDiscount(staff, b.code, { type: "FIXED", value: 100 })).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED" });
        expect(await updateDiscount(admin, b.code, { type: "FIXED", value: 100 })).toMatchObject({ discountAmount: 100, total: b.total - 100 });
    });

    it("staff can still raise a total (remove a discount, add a charge)", async () => {
        const b = await walkIn(500);
        await updateDiscount(staff, b.code, { type: "FIXED", value: 100 });
        expect(await updateDiscount(staff, b.code, null)).toMatchObject({ discountAmount: 0, total: b.total });
        const paid = await walkIn("FULL");
        expect(await updateAdditionalCharge(staff, paid.code, { amount: 200, reason: "Ball" })).toMatchObject({ total: paid.total + 200, balanceDue: 200 });
    });

    it("clearing an uncollected charge so nothing is left to pay is Super Admin only", async () => {
        const paid = await walkIn("FULL");
        await updateAdditionalCharge(staff, paid.code, { amount: 200, reason: "Ball" });
        await expect(updateAdditionalCharge(staff, paid.code, null)).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED", fields: { additionalCharge: expect.any(String) } });
        expect(await updateAdditionalCharge(admin, paid.code, null)).toMatchObject({ total: paid.total, balanceDue: 0, paymentStatus: "PAID" });
    });
});

describe("re-check-in after an undo is Super Admin only", () => {
    it("staff: check in, undo, then checking in again is blocked", async () => {
        const b = await walkIn(500);
        await checkIn(staff, b.code, NAME_ID);
        const undone = await undoCheckIn(staff, b.code, "Wrong booking");
        expect(undone.bookingStatus).toBe("CONFIRMED");
        expect(undone.checkIn.state).toBe("BLOCKED");
        expect(undone.can.checkIn).toBe(false);
        await expect(checkIn(staff, b.code, NAME_ID)).rejects.toMatchObject({ code: "CHECKIN_BLOCKED" });
        await expect(checkIn(staff, b.code, { ...NAME_ID, overrideReason: "Customer insisted" })).rejects.toMatchObject({ code: "CHECKIN_BLOCKED" });
    });

    it("Super Admin: needs a reason, then it is recorded as an override", async () => {
        const b = await walkIn(500);
        await checkIn(staff, b.code, NAME_ID);
        await undoCheckIn(staff, b.code, undefined);
        const view = await undoCheckIn(admin, b.code, undefined).catch(() => null); // already undone: not checked in
        expect(view).toBeNull();
        await expect(checkIn(admin, b.code, NAME_ID)).rejects.toMatchObject({ code: "CHECKIN_BLOCKED" });
        const r = await checkIn(admin, b.code, { ...NAME_ID, overrideReason: "Customer came back" });
        expect(r.bookingStatus).toBe("CHECKED_IN");
    });

    it("bookings undone before the flag existed are still covered (CheckIn history)", async () => {
        const b = await walkIn(500);
        await checkIn(staff, b.code, NAME_ID);
        await undoCheckIn(staff, b.code, undefined);
        await BookingModel.updateOne({ bookingCode: b.code }, { $set: { checkInUndoneAt: null } });
        await expect(checkIn(staff, b.code, NAME_ID)).rejects.toMatchObject({ code: "CHECKIN_BLOCKED" });
    });

    it("a first check-in by staff is unchanged", async () => {
        const b = await walkIn(500);
        expect((await checkIn(staff, b.code, NAME_ID)).bookingStatus).toBe("CHECKED_IN");
    });
});

describe("password reset links", () => {
    beforeEach(async () => {
        await UserModel.deleteMany({ id: "reset-user" });
        await UserModel.create({
            id: "reset-user", name: "R", email: "r@example.com", phone: "01788880000", role: "CUSTOMER",
            passwordHash: await hashPassword("old-password-1"), branchIds: [], permissions: [], status: "ACTIVE", createdAt: new Date().toISOString(),
        });
    });

    it("issuing a new link (after the 1-minute cooldown) retires the older unused one", async () => {
        // The token is created after the response (Next after()); outside a request it runs in the background.
        const t0 = new Date();
        await requestPasswordReset("r@example.com", t0);
        await vi.waitFor(async () => expect(await ResetTokenModel.countDocuments({ userId: "reset-user" })).toBe(1));
        await requestPasswordReset("r@example.com", new Date(t0.getTime() + 61_000));
        await vi.waitFor(async () => expect(await ResetTokenModel.countDocuments({ userId: "reset-user" })).toBe(2));
        await vi.waitFor(async () => expect(await ResetTokenModel.countDocuments({ userId: "reset-user", usedAt: null })).toBe(1));
    });

    it("completing a reset retires every other outstanding link for the account", async () => {
        const { createHash, randomBytes: rb } = await import("crypto");
        const mkToken = async () => {
            const t = rb(32).toString("base64url");
            await ResetTokenModel.create({ id: crypto.randomUUID(), userId: "reset-user", tokenHash: createHash("sha256").update(t).digest("hex"), expiresAt: new Date(Date.now() + 600_000), createdAt: new Date() });
            return t;
        };
        const a = await mkToken();
        const b = await mkToken();
        await consumePasswordReset(a, "brand-new-pass-1");
        await expect(consumePasswordReset(b, "another-pass-2")).rejects.toMatchObject({ code: "RESET_TOKEN_INVALID" });
    });
});

describe("password hashing", () => {
    it("new hashes use the OWASP-equivalent parameters and verify", async () => {
        const h = await hashPassword("correct horse");
        expect(h.startsWith("scrypt2$16384$8$5$")).toBe(true);
        expect(await verifyPassword("correct horse", h)).toBe(true);
        expect(await verifyPassword("wrong horse", h)).toBe(false);
    });

    it("old (scrypt$salt$hash) hashes still verify and are upgraded on the next good login", async () => {
        const salt = randomBytes(16);
        const legacy = `scrypt$${salt.toString("base64")}$${scryptSync("legacy-pass-1", salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64")}`;
        expect((await checkPassword("legacy-pass-1", legacy)).ok).toBe(true);
        expect((await checkPassword("nope", legacy)).upgraded).toBeUndefined();

        await UserModel.create({
            id: "legacy-user", name: "L", email: "legacy@example.com", phone: "01788881111", role: "CUSTOMER",
            passwordHash: legacy, branchIds: [], permissions: [], status: "ACTIVE", createdAt: new Date().toISOString(),
        });
        expect(await authenticate("legacy@example.com", "legacy-pass-1")).not.toBeNull();
        const after = await UserModel.findOne({ id: "legacy-user" }).lean<{ passwordHash: string }>();
        expect(after!.passwordHash.startsWith("scrypt2$")).toBe(true);
        expect(await authenticate("legacy@example.com", "legacy-pass-1")).not.toBeNull();
    });

    it("refuses a hash with absurd parameters instead of running a huge scrypt", async () => {
        expect(await verifyPassword("x", "scrypt2$1073741824$8$1$AAAA$AAAA")).toBe(false);
        expect(await verifyPassword("x", "garbage")).toBe(false);
    });
});

describe("field images are only deleted when nothing else uses them", () => {
    it("two fields sharing one Cloudinary photo: changing one keeps the photo; changing the last deletes it", async () => {
        process.env.CLOUDINARY_CLOUD_NAME = "demo";
        const url = "https://res.cloudinary.com/demo/image/upload/v1/kaziturf/pitches/shared-photo.jpg";
        const [a, b] = pitches.filter((p) => p.branchId === "bogura").slice(0, 2);
        const base = (p: typeof a) => ({
            id: p.id, branchId: p.branchId, name: p.name, sport: p.sport, format: p.format, dimensions: p.dimensions ?? "", surface: p.surface ?? "",
            openTime: "00:00" as const, closeTime: "24:00" as const, slotMinutes: p.slotMinutes, maxConsecutiveSlots: p.maxConsecutiveSlots,
            facilities: p.facilities ?? [], status: p.status,
        });
        await updatePitch(admin, { ...base(a), image: url });
        await updatePitch(admin, { ...base(b), image: url });
        vi.mocked(deleteImage).mockClear();

        await updatePitch(admin, { ...base(a), image: "" });
        expect(deleteImage).not.toHaveBeenCalled();
        await updatePitch(admin, { ...base(b), image: "" });
        expect(deleteImage).toHaveBeenCalledWith("kaziturf/pitches/shared-photo");
    });
});

describe("client IP", () => {
    const req = (h: Record<string, string>) => new NextRequest("http://localhost/api/x", { headers: h });
    it("off Vercel the rightmost X-Forwarded-For hop is used (the leftmost is client-controlled)", () => {
        delete process.env.VERCEL;
        expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
        expect(clientIp(req({ "x-vercel-forwarded-for": "6.6.6.6", "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    });
    it("on Vercel its own headers are trusted", () => {
        process.env.VERCEL = "1";
        try {
            expect(clientIp(req({ "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "198.51.100.7" }))).toBe("198.51.100.7");
            expect(clientIp(req({ "x-forwarded-for": "198.51.100.8, 10.0.0.1" }))).toBe("198.51.100.8");
        } finally {
            delete process.env.VERCEL;
        }
    });
});

describe("shared (cross-instance) rate limit", () => {
    it("counts in MongoDB, so a second server instance sees the same count", async () => {
        const now = new Date("2026-11-22T10:00:00Z");
        for (let i = 0; i < 3; i++) expect(await sharedRateLimit("t:1.2.3.4", 3, 60_000, now)).toBe(true);
        // A fresh module instance (another serverless instance) still sees the counter.
        vi.resetModules();
        const other = await import("@/server/security/sharedRateLimit");
        expect(await other.sharedRateLimit("t:1.2.3.4", 3, 60_000, now)).toBe(false);
        expect(await other.sharedRateLimit("t:1.2.3.4", 3, 60_000, new Date("2026-11-22T10:01:00Z"))).toBe(true);
    });
});
