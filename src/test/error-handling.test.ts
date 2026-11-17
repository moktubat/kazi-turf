// Error handling and logging regressions: the root-layout error page, bKash failures that were
// swallowed without a log line, one response format for rate limits, and accurate error codes.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payments/bkash", () => ({
    bkashConfigured: () => true,
    bkashCreate: vi.fn(),
    bkashExecute: vi.fn(),
    bkashQuery: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/email", () => ({ sendEmail: async () => ({ id: "test" }) }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import GlobalError from "@/app/global-error";
import { POST as forgotRoute } from "@/app/api/auth/forgot-password/route";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { PaymentModel } from "@/models";
import { createStaff } from "@/server/admin/setup";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { plain } from "@/server/db/util";
import { handleError } from "@/server/http";
import { bkashCreate, bkashExecute, bkashQuery } from "@/server/payments/bkash";
import { settlePayment } from "@/server/payments/settle";
import { startBkashPayment } from "@/server/payments/start";
import type { Payment } from "@/types/ops";
import { resetDb, startDb, stopDb } from "./helpers";

const admin: ServerUser = { id: "admin", name: "Admin", role: "SUPER_ADMIN", phone: "01700000000", email: null, branchIds: [], permissions: ["*"] };
const alice: ServerUser = { id: "alice", name: "Alice", role: "CUSTOMER", phone: "01711111111", email: null, branchIds: [], permissions: [] };

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    process.env.AUTH_URL = "http://localhost:3000";
    vi.mocked(bkashCreate).mockReset().mockResolvedValue({ paymentId: "PID1", redirectUrl: "https://sandbox.example/x" });
    vi.mocked(bkashExecute).mockReset();
    vi.mocked(bkashQuery).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("root layout failure page (app/global-error.tsx)", () => {
    it("renders its own branded document with the reference, never the error text", () => {
        const error = Object.assign(new Error("MongoServerSelectionError: secret-host:27017"), { digest: "3141592653" });
        const html = renderToStaticMarkup(createElement(GlobalError, { error, retry: () => undefined }));
        expect(html).toMatch(/^<html lang="en">/);
        expect(html).toContain("<title>Something went wrong · Kazi Sports Arena</title>"); // React hoists it into <head>
        expect(html).toContain("<body");
        expect(html).toContain("Something went wrong");
        expect(html).toMatch(/Reference: (<!-- -->)?3141592653/);
        expect(html).toContain("Try again");
        expect(html).toContain('href="/"');
        expect(html).not.toContain("secret-host");
        expect(html).not.toContain("MongoServerSelectionError");
    });

    it("works without a digest (client-side errors)", () => {
        const html = renderToStaticMarkup(createElement(GlobalError, { error: "boom", retry: () => undefined }));
        expect(html).not.toContain("Reference");
        expect(html).not.toContain("boom");
    });
});

describe("bKash failures are logged, not swallowed", () => {
    async function pendingPayment() {
        const today = await todayDhaka(new Date());
        const dto = await createBooking(alice, { pitchId: "bogura-b", cellStarts: [dhakaToUtc(addDays(today, 1), 12 * 60).toISOString()], phone: "01711111111" });
        await startBkashPayment(alice, dto.code);
        return plain<Payment>(await PaymentModel.findOne({}).lean());
    }

    it("an unreachable status check keeps the payment pending AND writes an error with the payment id", async () => {
        const p = await pendingPayment();
        vi.mocked(bkashQuery).mockRejectedValue(new Error("bKash query failed (503)"));
        const err = vi.spyOn(console, "error").mockImplementation(() => undefined);

        expect(await settlePayment(p.id, "reconcile")).toBe("PENDING");
        const line = err.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("[bkash] status check failed"));
        expect(line).toContain(p.id);
        expect(line).toContain("bKash query failed (503)");
        expect((await PaymentModel.findOne({ id: p.id }).lean<Payment>())!.status).toBe("PENDING");
    });

    it("a failed execute is logged as a warning and the status check still decides", async () => {
        const p = await pendingPayment();
        vi.mocked(bkashExecute).mockRejectedValue(new Error("bKash execute timed out"));
        vi.mocked(bkashQuery).mockResolvedValue({ state: "FAILED" });
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(await settlePayment(p.id, "success")).toBe("FAILED");
        expect(warn.mock.calls.map((c) => c.join(" ")).some((l) => l.includes(`execute failed for payment ${p.id}`) && l.includes("timed out"))).toBe(true);
    });
});

describe("one API error format", () => {
    it("forgot-password's rate limit has the standard body, wording and no-store header", async () => {
        const call = () =>
            forgotRoute(
                new NextRequest("http://localhost:3000/api/auth/forgot-password", {
                    method: "POST",
                    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" },
                    body: JSON.stringify({ identifier: "nobody@example.com" }),
                })
            );
        for (let i = 0; i < 5; i++) expect((await call()).status).toBe(200);
        const limited = await call();
        expect(limited.status).toBe(429);
        expect(limited.headers.get("cache-control")).toBe("no-store");
        expect(await limited.json()).toEqual({ code: "RATE_LIMITED", message: "Too many requests. Please wait a few minutes." });
    });

    it("an unknown venue in the staff form is a VALIDATION error on that field, not NOT_FOUND", async () => {
        await expect(
            createStaff(admin, {
                name: "New Staff", phone: "01799990000", email: "", password: "Strong-Pass#123",
                role: "STAFF", branchIds: ["no-such-venue"], permissions: [],
            })
        ).rejects.toMatchObject({ code: "VALIDATION", status: 400, fields: { branchIds: "Unknown venue" } });
    });

    it("an unexpected error returns a generic 500 with a reference that matches the server log", async () => {
        const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const res = handleError(new Error("E11000 duplicate key { phone: \"01711111111\" } password=hunter2"));
        expect(res.status).toBe(500);
        const body = await res.json();
        const ref = body.message.match(/Reference: ([0-9a-f-]{36})\.$/)?.[1];
        expect(body.code).toBe("SERVER_ERROR");
        expect(ref).toBeTruthy();
        expect(JSON.stringify(body)).not.toMatch(/E11000|hunter2|01711111111/);
        expect(err.mock.calls[0][0]).toBe(`[api:${ref}]`);
    });
});
