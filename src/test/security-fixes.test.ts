// Regression tests for the security audit fixes:
//  1. A field editor could make the server delete any Cloudinary asset (e.g. a sport background).
//  2. Staff / Super Admin could drop to a weak password through change-password or reset.
//  3. The contact-form subject was written unescaped into the admin email's <title>.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
    process.env.CLOUDINARY_CLOUD_NAME = "ourcloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    process.env.AUTH_URL = "http://localhost:3000";
    return { destroyed: [] as string[] };
});

// Only the outside services are replaced: Cloudinary's API and Resend.
vi.mock("cloudinary", () => ({
    v2: {
        config: () => undefined,
        uploader: {
            destroy: async (id: string) => {
                env.destroyed.push(id);
                return { result: "ok" };
            },
        },
    },
}));
const outbox: { to: string; text?: string }[] = [];
vi.mock("@/server/email", () => ({
    sendEmail: async (m: { to: string; text?: string }) => {
        outbox.push(m);
        return { id: "test" };
    },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { pitches } from "@/data/pitches";
import { UserModel } from "@/models";
import { createPitch, deletePitch, updatePitch } from "@/server/admin/setup";
import { hashPassword } from "@/server/auth/password";
import { consumePasswordReset, requestPasswordReset } from "@/server/auth/resetToken";
import type { ServerUser } from "@/server/auth/session";
import { authenticate, changePassword } from "@/server/auth/users";
import { publicIdFromImage } from "@/server/cloudinary";
import { inquiryEmailTemplate } from "@/server/email/templates";
import { resetDb, startDb, stopDb } from "./helpers";

const editor: ServerUser = {
    id: "editor", name: "Editor", role: "STAFF", phone: "01711000001", email: null,
    branchIds: ["bogura"], permissions: ["pitches.edit"],
};
const SPORT_BG = "https://res.cloudinary.com/ourcloud/image/upload/v17/kaziturf/sports/football-bg-1a2b3c.jpg";
const OWN_PHOTO = "https://res.cloudinary.com/ourcloud/image/upload/v17/kaziturf/pitches/field-a-4d5e6f.jpg";
const field = (name: string, image: string) => ({
    branchId: "bogura", name, sport: "Football", format: "5 vs 5", dimensions: "", surface: "",
    openTime: "00:00" as const, closeTime: "24:00" as const, slotMinutes: 90, maxConsecutiveSlots: 2,
    facilities: [], image, status: "ACTIVE" as const,
});

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    env.destroyed.length = 0;
    outbox.length = 0;
});

describe("Cloudinary deletes are limited to our cloud and the operation's folder", () => {
    it("publicIdFromImage accepts only our own assets in the expected folder", () => {
        expect(publicIdFromImage(OWN_PHOTO, "kaziturf/pitches")).toBe("kaziturf/pitches/field-a-4d5e6f");
        expect(publicIdFromImage(SPORT_BG, "kaziturf/sports")).toBe("kaziturf/sports/football-bg-1a2b3c");

        // Wrong folder for the operation (a field photo pointing at a sport background).
        expect(publicIdFromImage(SPORT_BG, "kaziturf/pitches")).toBeNull();
        // Another cloud's URL would otherwise destroy the same public ID in ours.
        expect(publicIdFromImage("https://res.cloudinary.com/othercloud/image/upload/kaziturf/pitches/x.jpg", "kaziturf/pitches")).toBeNull();
        // Dot segments that new URL() would resolve into another folder.
        expect(publicIdFromImage("https://res.cloudinary.com/ourcloud/image/upload/kaziturf/pitches/../sports/football-bg-1a2b3c.jpg", "kaziturf/pitches")).toBeNull();
        // Anything outside the app's folders, local paths, other hosts.
        expect(publicIdFromImage("https://res.cloudinary.com/ourcloud/image/upload/v1/gallery/hero.jpg", "kaziturf/pitches")).toBeNull();
        expect(publicIdFromImage("/uploads/123-x.jpg", "kaziturf/pitches")).toBeNull();
        expect(publicIdFromImage("https://evil.example/ourcloud/image/upload/kaziturf/pitches/x.jpg", "kaziturf/pitches")).toBeNull();
    });

    it("a field editor cannot get a sport background deleted by replacing or deleting a field", async () => {
        pitches.splice(0);
        await createPitch(editor, field("Trap Field", SPORT_BG));
        const p = pitches.find((x) => x.name === "Trap Field")!;

        await updatePitch(editor, { ...field("Trap Field", OWN_PHOTO), id: p.id });
        await deletePitch(editor, p.id);

        expect(env.destroyed).not.toContain("kaziturf/sports/football-bg-1a2b3c");
        // The field's own photo is still cleaned up as before.
        expect(env.destroyed).toEqual(["kaziturf/pitches/field-a-4d5e6f"]);
    });
});

describe("Staff and Super Admin keep the staff password policy", () => {
    async function seed(id: string, role: "CUSTOMER" | "STAFF" | "SUPER_ADMIN", email: string) {
        await UserModel.create({
            id, name: id, role, phone: `0171${String(id.length).padStart(7, "0")}`, email, emailVerified: true,
            branchIds: role === "CUSTOMER" ? [] : ["bogura"], permissions: [], status: "ACTIVE",
            passwordHash: await hashPassword("Old-Pass#12345"), createdAt: new Date().toISOString(),
        });
    }
    const resetToken = async (email: string) => {
        await vi.waitFor(() => expect(outbox.some((m) => m.to === email)).toBe(true));
        return outbox.find((m) => m.to === email)!.text!.match(/reset=([\w-]+)/)![1];
    };

    it("change password: a weak password is refused for staff, still allowed for customers", async () => {
        await seed("staffer", "STAFF", "staffer@example.com");
        await seed("cust", "CUSTOMER", "cust@example.com");

        await expect(changePassword("staffer", "Old-Pass#12345", "weakpass1")).rejects.toMatchObject({
            code: "VALIDATION",
            fields: { newPassword: expect.any(String) },
        });
        expect(await authenticate("staffer@example.com", "Old-Pass#12345")).not.toBeNull();

        await changePassword("staffer", "Old-Pass#12345", "New-Strong#2026");
        expect(await authenticate("staffer@example.com", "New-Strong#2026")).not.toBeNull();

        await changePassword("cust", "Old-Pass#12345", "simple-pass-1");
        expect(await authenticate("cust@example.com", "simple-pass-1")).not.toBeNull();
    });

    it("reset: a weak password is refused for a Super Admin without burning the link", async () => {
        await seed("boss", "SUPER_ADMIN", "boss@example.com");
        await requestPasswordReset("boss@example.com");
        const token = await resetToken("boss@example.com");

        await expect(consumePasswordReset(token, "weakpass1")).rejects.toMatchObject({ code: "VALIDATION" });
        expect(await authenticate("boss@example.com", "weakpass1")).toBeNull();

        await consumePasswordReset(token, "Brand-New#Pass99");
        expect(await authenticate("boss@example.com", "Brand-New#Pass99")).not.toBeNull();
    });

    it("reset: customers keep the customer rule", async () => {
        await seed("cust2", "CUSTOMER", "cust2@example.com");
        await requestPasswordReset("cust2@example.com");
        await consumePasswordReset(await resetToken("cust2@example.com"), "simple-pass-2");
        expect(await authenticate("cust2@example.com", "simple-pass-2")).not.toBeNull();
    });
});

describe("Inquiry email escapes the visitor's subject everywhere", () => {
    it("the <title> cannot be broken out of", () => {
        const { html } = inquiryEmailTemplate({
            firstName: "Eve", lastName: "Test", email: "eve@example.com", phone: "01711000000", sport: "Football",
            subject: `</title></head><body><a href="https://evil.example">Verify your account</a>`,
            message: "Hello there, a message.",
        });
        expect(html).not.toContain(`<a href="https://evil.example">`);
        expect(html).not.toMatch(/<\/title><\/head><body><a/);
        expect(html).toContain("&lt;/title&gt;");
    });
});
