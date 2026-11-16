// GET /api/cron/reconcile, the endpoint cron-job.org calls every 5 minutes.
// Real route handler + real reconciliation against in-memory MongoDB; only bKash and the
// email sender are simulated.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/server/payments/bkash", () => ({
    bkashConfigured: () => true,
    bkashCreate: vi.fn(),
    bkashExecute: vi.fn(),
    bkashQuery: vi.fn(),
}));
const sent: { to: string; subject: string }[] = [];
vi.mock("@/server/email", () => ({
    sendEmail: vi.fn(async (m: { to: string; subject: string }) => {
        sent.push(m);
        return { id: "x" };
    }),
}));
// connection() needs a real Next request scope; the route logic under test does not.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => undefined }));

import { GET as cron } from "@/app/api/cron/reconcile/route";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, PaymentModel, SlotClaimModel, UserModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { bkashCreate, bkashQuery } from "@/server/payments/bkash";
import { startBkashPayment } from "@/server/payments/start";
import { resetDb, startDb, stopDb } from "./helpers";

const SECRET = "c".repeat(64);
const customer: ServerUser = { id: "u-cron", name: "Cron Customer", role: "CUSTOMER", phone: "01711111111", email: "cron@example.com", branchIds: [], permissions: [] };

const call = (auth?: string) =>
    cron(new NextRequest("https://kazisports.com/api/cron/reconcile", { headers: auth === undefined ? {} : { authorization: auth } }));

/** A booking whose bKash payment started 3 minutes ago (old enough for the cron to check). */
async function paidButNeverReturned(h = 12) {
    const tomorrow = addDays(await todayDhaka(new Date()), 1);
    const dto = await createBooking(customer, { pitchId: "bogura-b", cellStarts: [dhakaToUtc(tomorrow, h * 60).toISOString()], phone: "01711111111" });
    await startBkashPayment(customer, dto.code);
    const p = await PaymentModel.findOne({ bookingId: (await BookingModel.findOne({ bookingCode: dto.code }).lean<{ id: string }>())!.id }).lean<{ id: string; amount: number; invoice: string; providerPaymentId: string }>();
    await PaymentModel.updateOne({ id: p!.id }, { $set: { createdAt: new Date(Date.now() - 3 * 60_000).toISOString() } });
    return { code: dto.code, payment: p! };
}

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    sent.length = 0;
    process.env.CRON_SECRET = SECRET;
    process.env.AUTH_URL = "https://kazisports.com";
    await UserModel.create({ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, passwordHash: "x", role: "CUSTOMER", branchIds: [], permissions: [], status: "ACTIVE" });
    vi.mocked(bkashCreate).mockReset().mockResolvedValue({ paymentId: `PID-${Math.random()}`, redirectUrl: "https://sandbox.payment.bkash.com/x" });
    vi.mocked(bkashQuery).mockReset().mockResolvedValue({ state: "UNKNOWN" });
});

describe("authorization (CRON_SECRET is mandatory)", () => {
    it.each([
        ["no header", undefined],
        ["wrong secret", `Bearer ${"d".repeat(64)}`],
        ["right secret without 'Bearer '", SECRET],
        ["a prefix of the secret", `Bearer ${SECRET.slice(0, 32)}`],
        ["the secret plus extra", `Bearer ${SECRET}x`],
        ["lower-case scheme", `bearer ${SECRET}`],
    ])("%s -> 401, nothing reconciled", async (_label, auth) => {
        const { code } = await paidButNeverReturned();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "COMPLETED", trxId: "T1", amount: 999, currency: "BDT" } as never);
        const res = await call(auth);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ code: "UNAUTHORIZED", message: "Not allowed." });
        expect(bkashQuery).not.toHaveBeenCalled();
        expect((await BookingModel.findOne({ bookingCode: code }).lean<{ bookingStatus: string }>())!.bookingStatus).toBe("PENDING_PAYMENT");
    });

    it("refuses everything when CRON_SECRET is not configured (fails closed)", async () => {
        delete process.env.CRON_SECRET;
        expect((await call("Bearer ")).status).toBe(401);
        expect((await call("Bearer undefined")).status).toBe(401);
    });

    it("never puts the secret in the response or the logs", async () => {
        const logs: string[] = [];
        const spies = (["log", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void logs.push(a.join(" "))));
        const bad = await call(`Bearer ${SECRET}x`);
        const good = await call(`Bearer ${SECRET}`);
        spies.forEach((s) => s.mockRestore());
        expect(await bad.text()).not.toContain(SECRET);
        expect(await good.text()).not.toContain(SECRET);
        expect(logs.join("\n")).not.toContain(SECRET);
        expect(good.headers.get("cache-control")).toBe("no-store");
    });
});

describe("reconciliation", () => {
    it("confirms a payment whose customer never returned, and sends one confirmation email", async () => {
        const { code, payment } = await paidButNeverReturned();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "COMPLETED", paymentId: payment.providerPaymentId, trxId: "TRX-1", amount: payment.amount, currency: "BDT", invoice: payment.invoice });
        const res = await call(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ checked: 1, confirmed: 1, refund: 0, failed: 0, pending: 0, deferred: 0 });
        expect(await BookingModel.findOne({ bookingCode: code }).lean()).toMatchObject({ bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID" });
        expect(await PaymentModel.findOne({ id: payment.id }).lean()).toMatchObject({ status: "SUCCESS", providerTxnId: "TRX-1" });
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).toMatchObject({ to: "cron@example.com" });
    });

    it("expires an unpaid hold and frees its slot", async () => {
        const tomorrow = addDays(await todayDhaka(new Date()), 1);
        const dto = await createBooking(customer, { pitchId: "bogura-b", cellStarts: [dhakaToUtc(tomorrow, 15 * 60).toISOString()], phone: "01711111111" });
        const past = new Date(Date.now() - 60_000).toISOString();
        await BookingModel.updateOne({ bookingCode: dto.code }, { $set: { holdExpiresAt: past } });
        await SlotClaimModel.updateMany({}, { $set: { expiresAt: past } });

        const body = await (await call(`Bearer ${SECRET}`)).json();
        expect(body).toMatchObject({ expiredHolds: 1 });
        expect((await BookingModel.findOne({ bookingCode: dto.code }).lean<{ bookingStatus: string }>())!.bookingStatus).toBe("EXPIRED");
        expect(await SlotClaimModel.countDocuments({ state: "HELD" })).toBe(0);
    });

    it("overlapping and repeated runs confirm once, record one payment and send one email", async () => {
        const { code, payment } = await paidButNeverReturned();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "COMPLETED", paymentId: payment.providerPaymentId, trxId: "TRX-2", amount: payment.amount, currency: "BDT", invoice: payment.invoice });

        const runs = await Promise.all([1, 2, 3, 4, 5].map(() => call(`Bearer ${SECRET}`)));
        expect(runs.every((r) => r.status === 200)).toBe(true);
        const again = await (await call(`Bearer ${SECRET}`)).json(); // a later run: nothing left to do
        expect(again).toMatchObject({ checked: 0, confirmed: 0 });

        expect(await PaymentModel.countDocuments({ status: "SUCCESS" })).toBe(1);
        expect(await PaymentModel.countDocuments({ providerTxnId: "TRX-2" })).toBe(1);
        expect(await BookingModel.findOne({ bookingCode: code }).lean()).toMatchObject({ bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID" });
        expect(await SlotClaimModel.countDocuments({ state: "BOOKED" })).toBe(1);
        await new Promise((r) => setTimeout(r, 200)); // let any (wrong) extra email land
        expect(sent).toHaveLength(1);
    });

    it("a payment bKash has not finished stays pending for the next run", async () => {
        const { code } = await paidButNeverReturned();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "UNKNOWN" } as never);
        expect(await (await call(`Bearer ${SECRET}`)).json()).toMatchObject({ checked: 1, pending: 1, confirmed: 0 });
        expect((await BookingModel.findOne({ bookingCode: code }).lean<{ paymentStatus: string }>())!.paymentStatus).toBe("PENDING");
    });
});
