// Email sending layer (server/email): timeouts, retries, idempotency, and logs that never
// carry codes, tokens, subjects or full addresses. Only the Resend SDK is replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

type SendCall = { payload: { to: string; subject: string }; options: { idempotencyKey?: string; signal?: AbortSignal } };
const calls: SendCall[] = [];
let impl: (c: SendCall) => Promise<unknown> = async () => ({ data: { id: "msg_1" }, error: null, headers: {} });
vi.mock("resend", () => ({
    Resend: class {
        emails = {
            send: (payload: SendCall["payload"], options: SendCall["options"]) => {
                const c = { payload, options };
                calls.push(c);
                return impl(c);
            },
        };
    },
}));

const MSG = { to: "rahim@example.com", subject: "123456 is your Kazi Sports Arena verification code", html: "<p>123456</p>", text: "code: 123456" };
const err = (statusCode: number | null, name = "application_error", headers: Record<string, string> = {}) => ({ data: null, error: { statusCode, name, message: name }, headers });

let logs: string[] = [];
async function load(key: string | null = "re_test_key") {
    vi.resetModules();
    if (key) process.env.RESEND_API_KEY = key;
    else delete process.env.RESEND_API_KEY;
    return import("@/server/email");
}

beforeEach(() => {
    calls.length = 0;
    logs = [];
    for (const m of ["info", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
    impl = async () => ({ data: { id: "msg_1" }, error: null, headers: {} });
});
afterEach(() => vi.restoreAllMocks());

describe("sendEmail", () => {
    it("accepted on the first try: returns the message id; passes the idempotency key and a timeout signal", async () => {
        const { sendEmail } = await load();
        const r = await sendEmail(MSG, { flow: "register_code", idempotencyKey: "otp-abc" });
        expect(r).toEqual({ id: "msg_1", attempts: 1 });
        expect(calls).toHaveLength(1);
        expect(calls[0].options.idempotencyKey).toBe("otp-abc");
        expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
        const accepted = logs.find((l) => l.includes('"email.accepted"'))!;
        expect(JSON.parse(accepted)).toMatchObject({ flow: "register_code", attempt: 1, messageId: "msg_1", providerMs: expect.any(Number) });
    });

    it("a temporary provider error (5xx) is retried with the SAME idempotency key", async () => {
        let n = 0;
        impl = async () => (++n === 1 ? err(503) : { data: { id: "msg_2" }, error: null, headers: {} });
        const { sendEmail } = await load();
        const r = await sendEmail(MSG, { idempotencyKey: "otp-xyz" });
        expect(r).toEqual({ id: "msg_2", attempts: 2 });
        expect(calls.map((c) => c.options.idempotencyKey)).toEqual(["otp-xyz", "otp-xyz"]);
        expect(logs.some((l) => l.includes('"email.retry"'))).toBe(true);
    });

    it("rate limiting (429) is retried", async () => {
        let n = 0;
        impl = async () => (++n === 1 ? err(429, "rate_limit_exceeded", { "retry-after": "1" }) : { data: { id: "msg_3" }, error: null, headers: {} });
        const { sendEmail } = await load();
        expect(await sendEmail(MSG)).toEqual({ id: "msg_3", attempts: 2 });
    });

    it("a hung request is cut off by the timeout and retried; gives up after maxAttempts", async () => {
        // Like the SDK: a network failure or abort comes back as an error with no status code.
        impl = (c) => new Promise((resolve) => c.options.signal!.addEventListener("abort", () => resolve(err(null))));
        const { sendEmail } = await load();
        const t = Date.now();
        const r = await sendEmail(MSG, { timeoutMs: 50, maxAttempts: 2, budgetMs: 5_000 });
        expect(r.error).toMatch(/No answer from Resend within 50 ms/);
        expect(r.attempts).toBe(2);
        expect(calls).toHaveLength(2);
        expect(Date.now() - t).toBeLessThan(2_000);
        expect(logs.some((l) => l.includes('"error":"timeout"'))).toBe(true);
    });

    it("a permanent rejection (e.g. invalid address, 422) is NOT retried", async () => {
        impl = async () => err(422, "validation_error");
        const { sendEmail } = await load();
        expect(await sendEmail(MSG)).toMatchObject({ error: "validation_error", attempts: 1 });
        expect(calls).toHaveLength(1);
    });

    it("stops retrying when the time budget would be exceeded", async () => {
        impl = async () => err(503);
        const { sendEmail } = await load();
        const r = await sendEmail(MSG, { timeoutMs: 1_000, maxAttempts: 3, budgetMs: 1_200 });
        expect(r.attempts).toBe(1); // 400 ms backoff + a 1 s attempt would exceed 1.2 s
    });

    it("an exception thrown by the SDK is caught (never thrown to the caller)", async () => {
        impl = async () => { throw new Error("boom"); };
        const { sendEmail } = await load();
        const r = await sendEmail(MSG, { maxAttempts: 1 });
        expect(r).toMatchObject({ error: "boom", attempts: 1 });
    });

    it("no API key: skipped, nothing sent", async () => {
        const { sendEmail } = await load(null);
        expect(await sendEmail(MSG)).toEqual({ skipped: true });
        expect(calls).toHaveLength(0);
    });

    it("logs never contain the code, the subject, the body or the full address", async () => {
        let n = 0;
        impl = async () => (++n === 1 ? err(500) : { data: { id: "msg_4" }, error: null, headers: {} });
        const { sendEmail } = await load();
        await sendEmail(MSG, { flow: "register_code", idempotencyKey: "otp-secret-id" });
        const all = logs.join("\n");
        expect(all).not.toContain("123456");
        expect(all).not.toContain("verification code");
        expect(all).not.toContain("rahim@example.com");
        expect(all).toContain("r•••@example.com");
    });
});

describe("Resend webhook (delivery events)", () => {
    const secretBytes = Buffer.from("test-webhook-secret-32-bytes!!!!");
    const SECRET = `whsec_${secretBytes.toString("base64")}`;
    const sign = (id: string, ts: number, body: string) => `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
    const body = JSON.stringify({
        type: "email.delivered",
        created_at: "2026-11-22T10:00:03.500Z",
        data: { email_id: "msg_9", created_at: "2026-11-22T10:00:00.000Z", to: ["rahim@example.com"], subject: "123456 is your code" },
    });

    it("verifies signatures in constant time and rejects tampering and stale timestamps", async () => {
        const { verifyResendWebhook } = await import("@/server/email/webhook");
        const now = 1_795_000_000;
        expect(verifyResendWebhook(SECRET, { id: "m1", timestamp: String(now), signature: sign("m1", now, body) }, body, now)).toBe(true);
        expect(verifyResendWebhook(SECRET, { id: "m1", timestamp: String(now), signature: sign("m1", now, body) }, body + " ", now)).toBe(false);
        expect(verifyResendWebhook(SECRET, { id: "m1", timestamp: String(now - 600), signature: sign("m1", now - 600, body) }, body, now)).toBe(false);
        expect(verifyResendWebhook(SECRET, { id: "m1", timestamp: String(now), signature: null }, body, now)).toBe(false);
    });

    it("route: off without a secret, 401 on a bad signature, logs delivery time without recipient or subject", async () => {
        const { POST } = await import("@/app/api/webhooks/resend/route");
        const req = (headers: Record<string, string>) => new NextRequest("http://localhost/api/webhooks/resend", { method: "POST", headers, body });
        delete process.env.RESEND_WEBHOOK_SECRET;
        expect((await POST(req({}))).status).toBe(404);

        process.env.RESEND_WEBHOOK_SECRET = SECRET;
        const ts = Math.floor(Date.now() / 1000);
        expect((await POST(req({ "svix-id": "m1", "svix-timestamp": String(ts), "svix-signature": "v1,AAAA" }))).status).toBe(401);
        const ok = await POST(req({ "svix-id": "m1", "svix-timestamp": String(ts), "svix-signature": sign("m1", ts, body) }));
        expect(ok.status).toBe(204);
        const line = JSON.parse(logs.find((l) => l.includes('"email.webhook"'))!);
        expect(line).toMatchObject({ type: "email.delivered", messageId: "msg_9", sinceSendMs: 3500 });
        expect(logs.join("\n")).not.toMatch(/123456|rahim@example\.com/);
        delete process.env.RESEND_WEBHOOK_SECRET;
    });
});
