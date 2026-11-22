// Registration-code and password-reset email flows against a real in-memory MongoDB:
// parallel checks, one email per request burst, ordering, failure recovery, enumeration
// protection, and the reset email running through Next's after() (serverless-safe).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { to: string; subject: string; text?: string; opts?: { flow?: string; idempotencyKey?: string } };
const outbox: Sent[] = [];
let sendImpl: (m: Sent) => Promise<{ id?: string; error?: string; attempts?: number }> = async () => ({ id: "msg", attempts: 1 });
vi.mock("@/server/email", () => ({
    sendEmail: async (m: Sent, opts?: Sent["opts"]) => {
        const r = await sendImpl({ ...m, opts });
        if (r.id) outbox.push({ ...m, opts });
        return r;
    },
}));
// Record what is handed to after(): the platform runs these after the response and keeps the
// function alive for them. The test runs them explicitly, like the platform would.
const afterTasks: (() => Promise<unknown>)[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => Promise<unknown>) => void afterTasks.push(fn) }));

import { EmailOtpModel, ResetTokenModel, UserModel } from "@/models";
import { checkEmailOtp } from "@/server/auth/emailOtp";
import { hashPassword } from "@/server/auth/password";
import { RESET_COOLDOWN_MS, requestPasswordReset } from "@/server/auth/resetToken";
import { registerCustomer, startRegistration } from "@/server/auth/users";
import { resetDb, startDb, stopDb } from "./helpers";

const T0 = new Date("2026-11-22T10:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const details = (over: Record<string, string> = {}) => ({ name: "Rahim", phone: "01711112222", email: "rahim@example.com", ...over });
const codeOf = (m: Sent) => m.text!.match(/code: (\d{6})/)![1];
const runAfter = async () => { while (afterTasks.length) await afterTasks.shift()!(); };

beforeAll(async () => {
    process.env.AUTH_URL = "http://localhost:3000";
    await startDb();
}, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    outbox.length = 0;
    afterTasks.length = 0;
    sendImpl = async () => ({ id: "msg", attempts: 1 });
});

describe("registration code email", () => {
    it("is sent once, awaited (accepted before the response), labelled, with an idempotency key per code", async () => {
        const r = await startRegistration(details(), { now: T0 });
        expect(r.sentTo).toBe("r••••@example.com");
        expect(outbox).toHaveLength(1);
        const rec = await EmailOtpModel.findOne({}).lean<{ id: string }>();
        expect(outbox[0].opts).toEqual({ flow: "register_code", idempotencyKey: `otp-${rec!.id}` });
        expect(afterTasks).toHaveLength(0); // nothing left running after the response
    });

    it("a burst of simultaneous requests (double tap, two tabs) sends exactly one email with one live code", async () => {
        const results = await Promise.allSettled(Array.from({ length: 5 }, () => startRegistration(details(), { now: T0 })));
        expect(outbox).toHaveLength(1);
        expect(await EmailOtpModel.countDocuments({ supersededAt: null, consumedAt: null })).toBe(1);
        // Every caller got the normal "code sent" answer or the cooldown, never a second code.
        for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "OTP_COOLDOWN" });
        const user = await registerCustomer({ ...details(), password: "pass-2026-x", otpCode: codeOf(outbox[0]) }, { now: at(5) });
        expect(user.emailVerified).toBe(true);
    });

    it("a slow send that finishes late can't cancel a NEWER code", async () => {
        // Code A: Resend is slow for this one.
        let release!: () => void;
        sendImpl = () => new Promise((res) => (release = () => res({ id: "msg-a", attempts: 1 })));
        const a = startRegistration(details(), { now: T0 });
        await vi.waitFor(() => expect(release).toBeDefined());
        // Code B (an explicit resend after the cooldown) goes through quickly.
        sendImpl = async () => ({ id: "msg-b", attempts: 1 });
        await startRegistration(details(), { now: at(61), resend: true });
        const codeB = codeOf(outbox[0]);
        // Now A's send finishes.
        release();
        await a;
        // B is still the live code: A only superseded codes OLDER than itself.
        expect(await checkEmailOtp({ email: "rahim@example.com", purpose: "REGISTER", code: codeB, now: at(62) })).toBeTruthy();
    });

    it("provider failure: the request fails clearly, nothing is left behind, and an immediate retry works", async () => {
        sendImpl = async () => ({ error: "No answer from Resend within 5000 ms", attempts: 3 });
        await expect(startRegistration(details(), { now: T0 })).rejects.toMatchObject({ code: "EMAIL_SEND_FAILED", status: 502 });
        expect(await EmailOtpModel.countDocuments({})).toBe(0);
        sendImpl = async () => ({ id: "msg", attempts: 1 });
        await startRegistration(details(), { now: at(1) });
        expect(outbox).toHaveLength(1);
    });

    it("registered email: same answer, one email, and it carries no code", async () => {
        await UserModel.create({ id: "u1", name: "R", email: "rahim@example.com", phone: "01700000009", role: "CUSTOMER", passwordHash: "x", branchIds: [], permissions: [], status: "ACTIVE", createdAt: T0.toISOString() });
        const r = await startRegistration(details(), { now: T0 });
        expect(r).toEqual({ sentTo: "r••••@example.com", expiresInMinutes: 10, resendInSeconds: 60 });
        expect(outbox).toHaveLength(1);
        expect(outbox[0].text).not.toMatch(/\d{6}/);
    });
});

describe("password reset email", () => {
    beforeEach(async () => {
        await UserModel.create({ id: "u-reset", name: "R", email: "reset@example.com", phone: "01766660000", role: "CUSTOMER", passwordHash: await hashPassword("old-password-1"), branchIds: [], permissions: [], status: "ACTIVE", createdAt: T0.toISOString() });
    });

    it("the response does not wait for the email; the send is handed to after() (kept alive on serverless) and completes", async () => {
        expect(await requestPasswordReset("reset@example.com", T0)).toEqual({ sent: true });
        expect(outbox).toHaveLength(0);
        expect(afterTasks).toHaveLength(1);
        await runAfter();
        expect(outbox).toHaveLength(1);
        const rec = await ResetTokenModel.findOne({}).lean<{ id: string }>();
        expect(outbox[0].opts).toEqual({ flow: "password_reset", idempotencyKey: `reset-${rec!.id}` });
        expect(outbox[0].text).toMatch(/\/api\/auth\/reset-link\?reset=[\w-]{43}/);
    });

    it("unknown account: the same answer, nothing scheduled, nothing sent", async () => {
        expect(await requestPasswordReset("nobody@example.com", T0)).toEqual({ sent: true });
        expect(afterTasks).toHaveLength(0);
    });

    it("a double tap within the cooldown sends one email; after the cooldown a new link replaces the old", async () => {
        await requestPasswordReset("reset@example.com", T0);
        await requestPasswordReset("reset@example.com", at(5));
        await runAfter();
        expect(outbox).toHaveLength(1);
        await requestPasswordReset("reset@example.com", new Date(T0.getTime() + RESET_COOLDOWN_MS + 1_000));
        await runAfter();
        expect(outbox).toHaveLength(2);
        expect(await ResetTokenModel.countDocuments({ usedAt: null })).toBe(1);
    });

    it("simultaneous requests: exactly one email", async () => {
        await Promise.all(Array.from({ length: 4 }, () => requestPasswordReset("reset@example.com", T0)));
        await Promise.all(afterTasks.splice(0).map((t) => t()));
        expect(outbox).toHaveLength(1);
        expect(await ResetTokenModel.countDocuments({})).toBe(1);
    });

    it("provider failure: the link is withdrawn, so asking again right away sends a new one", async () => {
        sendImpl = async () => ({ error: "Resend 503", attempts: 3 });
        await requestPasswordReset("reset@example.com", T0);
        await runAfter();
        expect(await ResetTokenModel.countDocuments({})).toBe(0);
        sendImpl = async () => ({ id: "msg", attempts: 1 });
        await requestPasswordReset("reset@example.com", at(2));
        await runAfter();
        expect(outbox).toHaveLength(1);
    });

    it("registration and reset are independent: a reset failure doesn't affect sign-up codes", async () => {
        sendImpl = async (m) => (m.opts?.flow === "password_reset" ? { error: "down", attempts: 3 } : { id: "msg", attempts: 1 });
        await requestPasswordReset("reset@example.com", T0);
        await runAfter();
        await startRegistration(details({ email: "new@example.com" }), { now: T0 });
        expect(outbox.map((m) => m.opts?.flow)).toEqual(["register_code"]);
    });
});
