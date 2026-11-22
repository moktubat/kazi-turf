// QA audit 2026-11-22: regression tests for the issues fixed in that pass.
// Real MongoDB (in-memory replica set); only the bKash HTTP layer is mocked.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payments/bkash", () => ({
    bkashConfigured: () => true,
    bkashCreate: vi.fn(),
    bkashExecute: vi.fn(),
    bkashQuery: vi.fn(),
}));

import { NextRequest } from "next/server";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { AuditLogModel, BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import { availabilityQuerySchema } from "@/schemas/booking";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { plain } from "@/server/db/util";
import { bkashCreate, bkashExecute, bkashQuery } from "@/server/payments/bkash";
import { settlePayment } from "@/server/payments/settle";
import { startBkashPayment } from "@/server/payments/start";
import { isLocked, recordLoginFailure } from "@/server/auth/lockout";
import { GET as resetLinkRoute } from "@/app/api/auth/reset-link/route";
import { POST as createBookingRoute } from "@/app/api/bookings/route";
import { proxy } from "@/proxy";
import { jsonLdHtml } from "@/lib/seo";
import { pitchSchema } from "@/schemas/setup";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { resetDb, startDb, stopDb } from "./helpers";

const customer = (id: string, phone: string): ServerUser => ({
    id,
    name: `Customer ${id}`,
    role: "CUSTOMER",
    phone,
    email: null,
    branchIds: [],
    permissions: [],
});
const alice = customer("u-alice", "01711111111");
const bob = customer("u-bob", "01722222222");

const noonTomorrow = async () => dhakaToUtc(addDays(await todayDhaka(new Date()), 1), 12 * 60).toISOString();

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    process.env.AUTH_URL = "http://localhost:3000";
    vi.mocked(bkashCreate).mockReset().mockResolvedValue({ paymentId: "PID1", redirectUrl: "https://sandbox.payment.bkash.com/x" });
    vi.mocked(bkashExecute).mockReset();
    vi.mocked(bkashQuery).mockReset().mockResolvedValue({ state: "UNKNOWN" });
});
afterEach(() => vi.useRealTimers());

describe("payment hold survives the bKash checkout", () => {
    it("keeps the cells claimed past the original hold so a second customer cannot take them", async () => {
        const cell = await noonTomorrow();
        const dto = await createBooking(alice, { pitchId: "bogura-b", cellStarts: [cell], phone: alice.phone });
        const before = plain<Booking>(await BookingModel.findOne({ bookingCode: dto.code }).lean());

        await startBkashPayment(alice, dto.code);

        const claim = plain<{ expiresAt: string }>(await SlotClaimModel.findOne({ bookingId: before.id }).lean());
        expect(Date.parse(claim.expiresAt)).toBeGreaterThan(Date.parse(before.holdExpiresAt));

        // One minute after Alice's original hold ran out she is still on the bKash page.
        const late = new Date(Date.parse(before.holdExpiresAt) + 60_000);
        await expect(
            createBooking(bob, { pitchId: "bogura-b", cellStarts: [cell], phone: bob.phone }, { now: late })
        ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

        // Her payment completes and the booking is confirmed, not sent to refund.
        const p = plain<Payment>(await PaymentModel.findOne({ bookingId: before.id }).lean());
        vi.mocked(bkashExecute).mockResolvedValue({
            state: "COMPLETED", paymentId: p.providerPaymentId, trxId: "TRX-A", amount: p.amount, currency: "BDT", invoice: p.invoice,
        });
        expect(await settlePayment(p.id, "success", late)).toBe("CONFIRMED");
    });

    it("an abandoned payment still frees the cells (the booking hold itself is not extended)", async () => {
        const cell = await noonTomorrow();
        const dto = await createBooking(alice, { pitchId: "bogura-b", cellStarts: [cell], phone: alice.phone });
        const before = plain<Booking>(await BookingModel.findOne({ bookingCode: dto.code }).lean());
        await startBkashPayment(alice, dto.code);
        const after = plain<Booking>(await BookingModel.findOne({ bookingCode: dto.code }).lean());
        expect(after.holdExpiresAt).toBe(before.holdExpiresAt);
    });
});

describe("money captured after a payment was marked failed", () => {
    it("is flagged as an anomaly with an audit entry instead of being dropped", async () => {
        const dto = await createBooking(alice, { pitchId: "bogura-b", cellStarts: [await noonTomorrow()], phone: alice.phone });
        await startBkashPayment(alice, dto.code);
        const p = plain<Payment>(await PaymentModel.findOne({}).lean());

        // While we ask bKash, another instance marks the payment FAILED; bKash then says COMPLETED.
        vi.mocked(bkashQuery).mockImplementation(async () => {
            await PaymentModel.updateOne({ id: p.id }, { $set: { status: "FAILED", failureReason: "CANCELLED" } });
            return { state: "COMPLETED", paymentId: p.providerPaymentId, trxId: "TRX-LATE", amount: p.amount, currency: "BDT", invoice: p.invoice };
        });

        expect(await settlePayment(p.id, "reconcile")).toBe("FAILED");
        const fresh = plain<Payment>(await PaymentModel.findOne({ id: p.id }).lean());
        expect(fresh.anomaly).toMatch(/COMPLETED.*TRX-LATE/);
        expect(await AuditLogModel.countDocuments({ action: "PAYMENT_ANOMALY" })).toBe(1);

        // A second settle does not duplicate the audit entry.
        await settlePayment(p.id, "reconcile");
        expect(await AuditLogModel.countDocuments({ action: "PAYMENT_ANOMALY" })).toBe(1);
    });
});

describe("login lockout decays", () => {
    it("an old failure streak no longer re-locks the account on a single wrong attempt", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-11-22T00:00:00Z"));
        for (let i = 0; i < 9; i++) await recordLoginFailure("victim@example.com");
        expect((await isLocked("victim@example.com")).locked).toBe(true);

        // Two hours later (lock long over), one wrong attempt must not lock again.
        vi.setSystemTime(new Date("2026-11-22T02:00:00Z"));
        expect((await isLocked("victim@example.com")).locked).toBe(false);
        const r = await recordLoginFailure("victim@example.com");
        expect(r.locked).toBe(false);
    });

    it("rapid failures still lock", async () => {
        for (let i = 0; i < 4; i++) expect((await recordLoginFailure("x@example.com")).locked).toBe(false);
        expect((await recordLoginFailure("x@example.com")).locked).toBe(true);
    });
});

describe("password reset link keeps the token out of page URLs", () => {
    it("moves a valid token into an httpOnly cookie and redirects to a clean /login", async () => {
        const token = "A".repeat(43);
        const res = await resetLinkRoute(new NextRequest(`http://localhost:3000/api/auth/reset-link?reset=${token}`));
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe("/login?mode=reset");
        const cookie = res.headers.get("set-cookie") ?? "";
        expect(cookie).toContain(`kt_reset=${token}`);
        expect(cookie.toLowerCase()).toContain("httponly");
    });

    it("sets no cookie for a malformed token", async () => {
        const res = await resetLinkRoute(new NextRequest("http://localhost:3000/api/auth/reset-link?reset=%3Cscript%3E"));
        expect(res.status).toBe(303);
        expect(res.headers.get("set-cookie")).toBeNull();
    });
});

describe("legacy /login?reset= links", () => {
    it("the proxy answers with an HTTP redirect to the reset-link route (no page HTML, no analytics)", () => {
        const res = proxy(new NextRequest("http://0.0.0.0:3000/login?reset=TOKEN123&next=/book", { headers: { host: "kazi.example" } }));
        expect(res.status).toBe(307);
        // Absolute (the proxy runtime requires it) and on the browser's host, not the listen address.
        expect(res.headers.get("location")).toBe("http://kazi.example/api/auth/reset-link?reset=TOKEN123");
        expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("leaves a normal /login request alone", () => {
        const res = proxy(new NextRequest("http://localhost:3000/login?mode=reset"));
        expect(res.headers.get("location")).toBeNull();
        expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    });
});

describe("JSON-LD on the home page", () => {
    it("cannot be broken out of by stored venue data", () => {
        const html = jsonLdHtml({ hasMap: "https://x</script><script>alert(1)</script>" });
        expect(html).not.toContain("<");
        expect(html).toContain("\\u003c/script>");
        expect(JSON.parse(html)).toEqual({ hasMap: "https://x</script><script>alert(1)</script>" });
    });
});

describe("input validation", () => {
    it("pitch image paths reject protocol-relative and parent-directory paths", () => {
        const image = pitchSchema.shape.image;
        expect(image.safeParse("//evil.example/x.png").success).toBe(false);
        expect(image.safeParse("/sports/../../etc/x.png").success).toBe(false);
        expect(image.safeParse("/sports/football.jpg").success).toBe(true);
        expect(image.safeParse("https://res.cloudinary.com/demo/image/upload/v1/kaziturf/pitches/a.jpg").success).toBe(true);
    });

    it("rejects impossible calendar dates without throwing", () => {
        expect(availabilityQuerySchema.safeParse({ sport: "football", date: "2026-11-31" }).success).toBe(false);
        expect(availabilityQuerySchema.safeParse({ sport: "football", date: "2026-13-01" }).success).toBe(false);
        expect(availabilityQuerySchema.safeParse({ sport: "football", date: "2028-02-29" }).success).toBe(true);
    });

    it("POST /api/bookings refuses a cross-site origin", async () => {
        const res = await createBookingRoute(
            new NextRequest("http://localhost:3000/api/bookings", {
                method: "POST",
                headers: { origin: "https://evil.example", host: "localhost:3000", "content-type": "application/json" },
                body: "{}",
            })
        );
        expect(res.status).toBe(403);
    });
});
