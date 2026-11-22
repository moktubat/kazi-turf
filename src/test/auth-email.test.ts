// Email verification (registration + email change) end to end against a real in-memory
// MongoDB. Only Resend's HTTP call is replaced: every "sent" email is captured here.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";

const outbox: { to: string; subject: string; text?: string }[] = [];
const sendMock = vi.fn(async (m: { to: string; subject: string; text?: string }) => {
    outbox.push(m);
    return { id: "test" } as { id?: string; error?: string; skipped?: boolean };
});
vi.mock("@/server/email", () => ({ sendEmail: (m: never) => sendMock(m) }));

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as registerCodeRoute } from "@/app/api/auth/register/code/route";
import { EmailOtpModel, UserModel } from "@/models";
import { MAX_ATTEMPTS, MAX_PER_EMAIL_HOUR, MAX_PER_IP, maskEmail } from "@/server/auth/emailOtp";
import { hashPassword } from "@/server/auth/password";
import { consumePasswordReset, requestPasswordReset } from "@/server/auth/resetToken";
import { SESSION_COOKIE } from "@/server/auth/session";
import {
    authenticate,
    confirmEmailChange,
    registerCustomer,
    sendEmailChangeCode,
    startRegistration,
    updateProfile,
} from "@/server/auth/users";
import { resetDb, startDb, stopDb } from "./helpers";

beforeAll(async () => {
    process.env.AUTH_URL = "http://localhost:3000";
    await startDb();
}, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    outbox.length = 0;
    sendMock.mockClear();
});

const T0 = new Date("2026-11-16T10:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
const lastCode = (to?: string) => {
    const m = [...outbox].reverse().find((x) => !to || x.to === to);
    const code = m?.text?.match(/code: (\d{6})/)?.[1];
    if (!code) throw new Error("no code email captured");
    return code;
};
const details = (over: Partial<{ name: string; phone: string; email: string; password: string }> = {}) => ({
    name: "Rahim Uddin", phone: "01711112222", email: "rahim@example.com", password: "turf-pass-2026", ...over,
});
const wrong = (c: string) => (c === "000000" ? "111111" : "000000");

async function seedUser(over: Record<string, unknown>) {
    const u = {
        id: crypto.randomUUID(), name: "Someone", email: null, phone: "01799990000", role: "CUSTOMER",
        branchIds: [], permissions: [], status: "ACTIVE", createdAt: T0.toISOString(),
        passwordHash: await hashPassword("old-password-1"), ...over,
    };
    await UserModel.create(u);
    return u as typeof u & { id: string; role: string; name: string };
}

describe("registration: code is emailed and required", () => {
    it("sends a 6-digit code to the customer's own address and stores only a keyed hash", async () => {
        const r = await startRegistration(details(), { ip: "1.1.1.1", now: T0 });
        expect(r).toEqual({ sentTo: maskEmail("rahim@example.com"), expiresInMinutes: 10, resendInSeconds: 60 });
        expect(outbox).toHaveLength(1);
        expect(outbox[0].to).toBe("rahim@example.com");
        const code = lastCode();
        expect(code).toMatch(/^\d{6}$/);

        const rec = await EmailOtpModel.findOne({ email: "rahim@example.com" }).lean<Record<string, unknown>>();
        expect(JSON.stringify(rec)).not.toContain(code);
        expect(rec!.codeHash).not.toBe(createHash("sha256").update(code).digest("hex")); // not a plain hash
        expect(rec!.ipHash).not.toBe("1.1.1.1");
        expect(await UserModel.countDocuments({})).toBe(0); // no account until the code is confirmed
    });

    it("the right code creates a verified customer once; the code can't be reused", async () => {
        await startRegistration(details(), { now: T0 });
        const code = lastCode();
        const u = await registerCustomer({ ...details(), otpCode: code }, { now: at(30) });
        expect(u).toMatchObject({ role: "CUSTOMER", email: "rahim@example.com", emailVerified: true, phone: "01711112222" });
        expect(await UserModel.countDocuments({})).toBe(1);

        await UserModel.deleteMany({}); // even with the account gone, the code is spent
        await expect(registerCustomer({ ...details(), otpCode: code }, { now: at(40) })).rejects.toMatchObject({ code: "OTP_EXPIRED" });
    });

    it("email is normalised: the code sent to Rahim@Example.com works for rahim@example.com", async () => {
        await startRegistration(details({ email: "  Rahim@Example.COM " }), { now: T0 });
        const u = await registerCustomer({ ...details(), otpCode: lastCode() }, { now: at(5) });
        expect(u.email).toBe("rahim@example.com");
    });

    it("a wrong code counts down, and after the last try even the right code is refused", async () => {
        await startRegistration(details(), { now: T0 });
        const code = lastCode();
        for (let i = 1; i < MAX_ATTEMPTS; i++) {
            await expect(registerCustomer({ ...details(), otpCode: wrong(code) }, { now: at(i) }))
                .rejects.toMatchObject({ code: "OTP_WRONG", message: expect.stringContaining(`${MAX_ATTEMPTS - i}`) });
        }
        await expect(registerCustomer({ ...details(), otpCode: wrong(code) }, { now: at(9) })).rejects.toMatchObject({ code: "OTP_LOCKED" });
        await expect(registerCustomer({ ...details(), otpCode: code }, { now: at(10) })).rejects.toMatchObject({ code: expect.stringMatching(/OTP_LOCKED|OTP_EXPIRED/) });
        expect(await UserModel.countDocuments({})).toBe(0);
    });

    it("parallel wrong guesses can't get past the attempt cap", async () => {
        await startRegistration(details(), { now: T0 });
        const code = lastCode();
        const r = await Promise.allSettled(Array.from({ length: 25 }, () => registerCustomer({ ...details(), otpCode: wrong(code) }, { now: at(5) })));
        const counted = r.filter((x) => x.status === "rejected" && ["OTP_WRONG", "OTP_LOCKED"].includes((x.reason as { code: string }).code));
        const attempts = (await EmailOtpModel.findOne({}).lean<{ attempts: number }>())!.attempts;
        expect(attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
        expect(counted.length).toBeGreaterThan(0);
        await expect(registerCustomer({ ...details(), otpCode: code }, { now: at(6) })).rejects.toBeTruthy();
    });

    it("a code expires after 10 minutes", async () => {
        await startRegistration(details(), { now: T0 });
        await expect(registerCustomer({ ...details(), otpCode: lastCode() }, { now: at(10 * 60 + 1) })).rejects.toMatchObject({ code: "OTP_EXPIRED" });
    });

    it("the step-2 form can't be skipped with a made-up code and no email step", async () => {
        await expect(registerCustomer({ ...details(), otpCode: "123456" }, { now: T0 })).rejects.toMatchObject({ code: "OTP_EXPIRED" });
        expect(await UserModel.countDocuments({})).toBe(0);
    });
});

describe("resend and send limits", () => {
    it("\"Resend code\" waits 60 s; the new code replaces the old one", async () => {
        await startRegistration(details(), { now: T0 });
        const first = lastCode();
        await expect(startRegistration(details(), { now: at(30), resend: true })).rejects.toMatchObject({ code: "OTP_COOLDOWN", status: 429 });
        expect(outbox).toHaveLength(1);

        await startRegistration(details(), { now: at(61), resend: true });
        const second = lastCode();
        if (first !== second) {
            await expect(registerCustomer({ ...details(), otpCode: first }, { now: at(62) })).rejects.toMatchObject({ code: expect.stringMatching(/OTP_WRONG|OTP_EXPIRED/) });
        }
        const u = await registerCustomer({ ...details(), otpCode: second }, { now: at(63) });
        expect(u.emailVerified).toBe(true);
    });

    it("\"Change details\" and submitting again with the same email reuses the code already sent", async () => {
        await startRegistration(details(), { now: T0 });
        const code = lastCode();
        const again = await startRegistration(details({ name: "Rahim U." }), { now: at(20) });
        expect(again).toMatchObject({ resendInSeconds: 40, expiresInMinutes: 10 });
        expect(outbox).toHaveLength(1); // nothing new sent
        const u = await registerCustomer({ ...details({ name: "Rahim U." }), otpCode: code }, { now: at(30) });
        expect(u.name).toBe("Rahim U.");
    });

    it(`at most ${MAX_PER_EMAIL_HOUR} codes per email per hour, enforced from the database`, async () => {
        for (let i = 0; i < MAX_PER_EMAIL_HOUR; i++) await startRegistration(details(), { ip: `10.0.0.${i}`, now: at(i * 61), resend: true });
        await expect(startRegistration(details(), { ip: "10.0.1.1", now: at(MAX_PER_EMAIL_HOUR * 61), resend: true })).rejects.toMatchObject({ code: "RATE_LIMITED" });
        await startRegistration(details(), { ip: "10.0.1.1", now: at(3601), resend: true }); // an hour after the first: allowed again
    });

    it(`at most ${MAX_PER_IP} codes per IP per 15 minutes, across different emails`, async () => {
        for (let i = 0; i < MAX_PER_IP; i++) {
            await startRegistration(details({ email: `c${i}@example.com`, phone: `0171000000${i}` }), { ip: "9.9.9.9", now: at(i) });
        }
        await expect(startRegistration(details({ email: "late@example.com", phone: "01710000099" }), { ip: "9.9.9.9", now: at(20) }))
            .rejects.toMatchObject({ code: "RATE_LIMITED" });
        await startRegistration(details({ email: "late@example.com", phone: "01710000099" }), { ip: "8.8.8.8", now: at(21) }); // other IP fine
    });

    it("a failed send is reported, leaves nothing behind and doesn't start the cooldown", async () => {
        sendMock.mockResolvedValueOnce({ error: "Resend rejected" });
        await expect(startRegistration(details(), { now: T0 })).rejects.toMatchObject({ code: "EMAIL_SEND_FAILED", status: 502 });
        expect(await EmailOtpModel.countDocuments({})).toBe(0);
        await startRegistration(details(), { now: at(1) }); // immediate retry works
        expect(outbox).toHaveLength(1);
    });
});

// 2026-11-22: step 1 answers the same for new and registered phones/emails (no account
// enumeration). A registered email gets an "account exists" notice instead of a code; a
// registered phone is only reported in step 2, after the email code was proven.
describe("duplicates are not revealed before the email is proven", () => {
    it("registered email: same response as a new one, but the email holds no code", async () => {
        await seedUser({ phone: "01700000001", email: "rahim@example.com" });
        const r = await startRegistration(details({ phone: "01711113333" }), { now: T0 });
        expect(r).toEqual({ sentTo: maskEmail("rahim@example.com"), expiresInMinutes: 10, resendInSeconds: 60 });
        expect(outbox).toHaveLength(1);
        expect(outbox[0].subject).toBe("You already have a Kazi Sports Arena account");
        expect(outbox[0].text).not.toMatch(/d{6}/);
        expect(outbox[0].text).toContain("http://localhost:3000/login");
        // Step 2 cannot tell either: any code is simply wrong, never "email taken".
        await expect(registerCustomer({ ...details({ phone: "01711113333" }), otpCode: "123456" }, { now: at(5) })).rejects.toMatchObject({ code: "OTP_WRONG" });
    });

    it("registered email: resend cooldown and limits behave exactly like a new email", async () => {
        await seedUser({ phone: "01700000001", email: "rahim@example.com" });
        await startRegistration(details({ phone: "01711113333" }), { now: T0 });
        await expect(startRegistration(details({ phone: "01711113333" }), { now: at(10), resend: true })).rejects.toMatchObject({ code: "OTP_COOLDOWN" });
    });

    it("registered phone: step 1 sends a real code; step 2 reports it only with a correct code", async () => {
        await seedUser({ phone: "01711112222" });
        const r = await startRegistration(details(), { now: T0 });
        expect(r.sentTo).toBe(maskEmail("rahim@example.com"));
        const code = lastCode();
        await expect(registerCustomer({ ...details(), otpCode: wrong(code) }, { now: at(5) })).rejects.toMatchObject({ code: "OTP_WRONG" });
        await expect(registerCustomer({ ...details(), otpCode: code }, { now: at(6) })).rejects.toMatchObject({ code: "PHONE_TAKEN" });
    });

    it("a taken phone in step 2 does not use up the code, but each check costs one try", async () => {
        await startRegistration(details(), { now: T0 });
        const code = lastCode();
        await seedUser({ phone: "01711112222" });
        await expect(registerCustomer({ ...details(), otpCode: code }, { now: at(5) })).rejects.toMatchObject({ code: "PHONE_TAKEN" });
        const rec = await EmailOtpModel.findOne({}).lean<{ consumedAt: Date | null; attempts: number }>();
        expect(rec).toMatchObject({ consumedAt: null, attempts: 1 });
        // The customer fixes the phone and the same code still works.
        const user = await registerCustomer({ ...details({ phone: "01711119999" }), otpCode: code }, { now: at(10) });
        expect(user.phone).toBe("01711119999");
    });

    it("probing phones with one code stops after the code's 5 tries", async () => {
        await startRegistration(details(), { now: T0 });
        const code = lastCode();
        for (let i = 0; i < 5; i++) await seedUser({ phone: `0171111000${i}`, id: `p${i}`, email: null });
        for (let i = 0; i < 5; i++) {
            await expect(registerCustomer({ ...details({ phone: `0171111000${i}` }), otpCode: code }, { now: at(5 + i) })).rejects.toMatchObject({ code: "PHONE_TAKEN" });
        }
        await expect(registerCustomer({ ...details({ phone: "01711117777" }), otpCode: code }, { now: at(20) })).rejects.toMatchObject({ code: "OTP_LOCKED" });
    });

    it("if the database's unique index catches a race, the transaction rolls back and the code survives", async () => {
        await startRegistration(details(), { now: T0 });
        const code = lastCode();
        await seedUser({ phone: "01711112222" });
        const spy = vi.spyOn(UserModel, "exists").mockResolvedValue(null as never); // pre-check misses it
        await expect(registerCustomer({ ...details(), otpCode: code }, { now: at(5) })).rejects.toMatchObject({ code: "PHONE_TAKEN" });
        spy.mockRestore();
        expect((await EmailOtpModel.findOne({}).lean<{ consumedAt: Date | null }>())!.consumedAt).toBeNull();
    });
});

describe("email change in My account (customers)", () => {
    it("the new email only replaces the old one after its code is confirmed", async () => {
        const u = await seedUser({ email: "old@example.com", emailVerified: true });
        const r = await updateProfile(u.id, { name: "Someone", phone: u.phone, email: "new@example.com" }, { now: T0 });
        expect(r).toMatchObject({ email: "old@example.com", emailVerified: true, emailPending: { email: "new@example.com" } });
        expect(outbox[0].to).toBe("new@example.com");
        expect(await UserModel.findOne({ id: u.id }).lean()).toMatchObject({ email: "old@example.com", emailVerified: true });
        expect(await authenticate("new@example.com", "old-password-1")).toBeNull(); // not usable to log in yet
        expect(await authenticate("old@example.com", "old-password-1")).not.toBeNull();

        await expect(confirmEmailChange(u, "new@example.com", wrong(lastCode()), at(5))).rejects.toMatchObject({ code: "OTP_WRONG" });
        await confirmEmailChange(u, "new@example.com", lastCode(), at(6));
        expect(await UserModel.findOne({ id: u.id }).lean()).toMatchObject({ email: "new@example.com", emailVerified: true });
        expect(await authenticate("new@example.com", "old-password-1")).not.toBeNull();
    });

    it("a code is bound to the account that asked for it", async () => {
        const a = await seedUser({ email: "a@example.com", emailVerified: true });
        const b = await seedUser({ phone: "01799990001", email: "b@example.com", emailVerified: true });
        await sendEmailChangeCode(a, "fresh@example.com", { now: T0 });
        await expect(confirmEmailChange(b, "fresh@example.com", lastCode(), at(5))).rejects.toMatchObject({ code: "OTP_EXPIRED" });
        expect(await UserModel.findOne({ id: b.id }).lean()).toMatchObject({ email: "b@example.com" });
    });

    it("a registration code can't be used to change an email (purposes are separate)", async () => {
        const u = await seedUser({ email: "old@example.com" });
        await startRegistration(details({ email: "x@example.com" }), { now: T0 });
        await expect(confirmEmailChange(u, "x@example.com", lastCode(), at(5))).rejects.toMatchObject({ code: "OTP_EXPIRED" });
    });

    it("an email that belongs to another account is refused before any code is sent", async () => {
        await seedUser({ phone: "01799990001", email: "taken@example.com" });
        const u = await seedUser({ email: "me@example.com" });
        await expect(updateProfile(u.id, { name: "Someone", phone: u.phone, email: "taken@example.com" }, { now: T0 })).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
        expect(outbox).toHaveLength(0);
    });

    it("removing the email never keeps the old verified status", async () => {
        const u = await seedUser({ email: "old@example.com", emailVerified: true });
        const r = await updateProfile(u.id, { name: "Someone", phone: u.phone, email: "" }, { now: T0 });
        expect(r).toMatchObject({ email: null, emailVerified: false });
        expect(await UserModel.findOne({ id: u.id }).lean()).toMatchObject({ email: null, emailVerified: false });
    });

    it("an older customer can verify the email already on the account", async () => {
        const u = await seedUser({ email: "legacy@example.com" }); // no emailVerified field at all
        await sendEmailChangeCode(u, "legacy@example.com", { now: T0 });
        await confirmEmailChange(u, "legacy@example.com", lastCode(), at(5));
        expect(await UserModel.findOne({ id: u.id }).lean()).toMatchObject({ email: "legacy@example.com", emailVerified: true });
        await expect(sendEmailChangeCode(u, "legacy@example.com", { now: at(120) })).rejects.toMatchObject({ code: "ALREADY_VERIFIED" });
    });

    it("saving the profile again while an email change is pending works and keeps the same code", async () => {
        const u = await seedUser({ email: "old@example.com", emailVerified: true });
        await updateProfile(u.id, { name: "Someone", phone: u.phone, email: "new@example.com" }, { now: T0 });
        const code = lastCode();
        // Fix a phone typo 20 s later (the new email is still in the field), then again after 2 minutes.
        const r2 = await updateProfile(u.id, { name: "Someone", phone: "01799990009", email: "new@example.com" }, { now: at(20) });
        expect(r2).toMatchObject({ phone: "01799990009", email: "old@example.com", emailPending: { email: "new@example.com", resendInSeconds: 40 } });
        await updateProfile(u.id, { name: "Some One", phone: "01799990009", email: "new@example.com" }, { now: at(140) });
        expect(outbox).toHaveLength(1); // one code, never replaced by re-saves
        expect(await UserModel.findOne({ id: u.id }).lean()).toMatchObject({ name: "Some One", phone: "01799990009", email: "old@example.com" });
        await confirmEmailChange(u, "new@example.com", code, at(150));
        expect(await UserModel.findOne({ id: u.id }).lean()).toMatchObject({ email: "new@example.com", emailVerified: true });
    });

    it("saving only the name doesn't send anything or change verification", async () => {
        const u = await seedUser({ email: "old@example.com", emailVerified: true });
        const r = await updateProfile(u.id, { name: "New Name", phone: u.phone, email: "OLD@example.com" }, { now: T0 });
        expect(r).toMatchObject({ name: "New Name", email: "old@example.com", emailVerified: true });
        expect(r.emailPending).toBeUndefined();
        expect(outbox).toHaveLength(0);
    });
});

describe("Staff and Super Admin are unaffected", () => {
    it("staff profile email changes stay direct (no code) but need the current password; the email-code endpoints refuse staff", async () => {
        const s = await seedUser({ role: "STAFF", email: "staff@example.com", branchIds: ["bogura"] });
        // 2026-11-22: a stolen staff session must not be able to re-point the account's email.
        await expect(updateProfile(s.id, { name: "Staff", phone: s.phone, email: "staff2@example.com" }, { now: T0 })).rejects.toMatchObject({ code: "REAUTH_REQUIRED", fields: { currentPassword: expect.any(String) } });
        await expect(updateProfile(s.id, { name: "Staff", phone: s.phone, email: "staff2@example.com", currentPassword: "wrong-password" }, { now: T0 })).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
        await expect(updateProfile(s.id, { name: "Staff", phone: "01799991111", email: "staff@example.com" }, { now: T0 })).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
        // A name-only change needs no password.
        await updateProfile(s.id, { name: "Staff Renamed", phone: s.phone, email: "staff@example.com" }, { now: T0 });
        const r = await updateProfile(s.id, { name: "Staff", phone: s.phone, email: "staff2@example.com", currentPassword: "old-password-1" }, { now: T0 });
        expect(r).toMatchObject({ email: "staff2@example.com", emailVerified: false });
        expect(r.emailPending).toBeUndefined();
        expect(outbox).toHaveLength(0);
        await expect(sendEmailChangeCode(s, "x@example.com")).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(confirmEmailChange(s, "x@example.com", "123456")).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
});

describe("login and password reset still work", () => {
    const login = (identifier: string, password: string, ip: string) =>
        loginRoute(new NextRequest("http://localhost:3000/api/auth/login", {
            method: "POST",
            headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": ip },
            body: JSON.stringify({ identifier, password }),
        }));

    it("older customers without an email, staff and admins log in exactly as before", async () => {
        await seedUser({ phone: "01788880001" }); // customer, no email, no emailVerified
        await seedUser({ phone: "01788880002", role: "STAFF", email: "st@example.com", branchIds: ["bogura"] });
        await seedUser({ phone: "01788880003", role: "SUPER_ADMIN", email: "ad@example.com" });
        for (const [id, ip] of [["01788880001", "2.0.0.1"], ["+8801788880002", "2.0.0.2"], ["st@example.com", "2.0.0.3"], ["ad@example.com", "2.0.0.4"]]) {
            const res = await login(id, "old-password-1", ip);
            expect(res.status, id).toBe(200);
            expect(res.headers.get("set-cookie")).toContain(SESSION_COOKIE);
        }
        expect((await login("ad@example.com", "wrong-password", "2.0.0.5")).status).toBe(401);
    });

    it("full HTTP flow: code route, register route, then the session cookie is set", async () => {
        const h = { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": "3.0.0.1" };
        const r1 = await registerCodeRoute(new NextRequest("http://localhost:3000/api/auth/register/code", { method: "POST", headers: h, body: JSON.stringify(details()) }));
        expect(r1.status).toBe(200);
        expect(await r1.json()).toMatchObject({ sentTo: maskEmail("rahim@example.com") });

        // Missing code: refused by validation, no account.
        const bad = await registerRoute(new NextRequest("http://localhost:3000/api/auth/register", { method: "POST", headers: h, body: JSON.stringify(details()) }));
        expect(bad.status).toBe(400);
        expect((await bad.json()).fields).toHaveProperty("otpCode");

        const r2 = await registerRoute(new NextRequest("http://localhost:3000/api/auth/register", { method: "POST", headers: h, body: JSON.stringify({ ...details(), otpCode: lastCode() }) }));
        expect(r2.status).toBe(201);
        expect(r2.headers.get("set-cookie")).toContain(SESSION_COOKIE);

        const cross = await registerCodeRoute(new NextRequest("http://localhost:3000/api/auth/register/code", { method: "POST", headers: { ...h, origin: "https://evil.example" }, body: JSON.stringify(details({ email: "z@example.com" })) }));
        expect(cross.status).toBe(403);
    });

    it("password reset works, including when the phone is typed as +880…", async () => {
        await seedUser({ phone: "01766660000", email: "reset@example.com" });
        await requestPasswordReset("+8801766660000");
        await vi.waitFor(() => expect(outbox.some((m) => m.to === "reset@example.com")).toBe(true));
        const token = outbox.find((m) => m.to === "reset@example.com")!.text!.match(/reset=([\w-]+)/)![1];
        await consumePasswordReset(token, "brand-new-pass-1");
        expect(await authenticate("reset@example.com", "brand-new-pass-1")).not.toBeNull();
    });
});
