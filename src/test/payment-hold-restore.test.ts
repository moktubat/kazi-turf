// M1 regression: when a bKash attempt ends WITHOUT payment, the slot claims go back from the
// checkout extension to the booking's own hold expiry. Successful payments are unchanged.
// Real in-memory MongoDB; only the bKash HTTP layer is mocked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payments/bkash", () => ({
    bkashConfigured: () => true,
    bkashCreate: vi.fn(),
    bkashExecute: vi.fn(),
    bkashQuery: vi.fn(),
}));

import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { plain, plainAll } from "@/server/db/util";
import { bkashCreate, bkashExecute, bkashQuery } from "@/server/payments/bkash";
import { settlePayment } from "@/server/payments/settle";
import { startBkashPayment } from "@/server/payments/start";
import type { SlotClaim } from "@/types";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { resetDb, startDb, stopDb } from "./helpers";

const user: ServerUser = { id: "u-hold", name: "Hold Tester", role: "CUSTOMER", phone: "01711111111", email: null, branchIds: [], permissions: [] };

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    process.env.AUTH_URL = "http://localhost:3000";
    vi.mocked(bkashCreate).mockReset().mockResolvedValue({ paymentId: "PID1", redirectUrl: "https://sandbox.payment.bkash.com/x" });
    vi.mocked(bkashExecute).mockReset();
    vi.mocked(bkashQuery).mockReset().mockResolvedValue({ state: "OPEN" });
});

const noon = async (h = 12) => dhakaToUtc(addDays(await todayDhaka(new Date()), 1), h * 60).toISOString();
const booking = async (code: string) => plain<Booking>(await BookingModel.findOne({ bookingCode: code }).lean());
const claims = async (bookingId: string) => plainAll<SlotClaim>(await SlotClaimModel.find({ bookingId }).lean());
const latestPayment = async () => plain<Payment>(await PaymentModel.findOne({}, null, { sort: { createdAt: -1 } }).lean());

/** A held booking with bKash checkout started: claims are extended past the hold. */
async function startedCheckout() {
    const dto = await createBooking(user, { pitchId: "bogura-b", cellStarts: [await noon()], phone: user.phone });
    await startBkashPayment(user, dto.code);
    const b = await booking(dto.code);
    const p = await latestPayment();
    const [c] = await claims(b.id);
    expect(c.expiresAt! > b.holdExpiresAt).toBe(true); // precondition: extended
    return { code: dto.code, b, p };
}

describe("an attempt that ends without payment restores the booking's own hold expiry", () => {
    it("failed payment (bKash reports FAILED)", async () => {
        const { code, b, p } = await startedCheckout();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "FAILED" });
        expect(await settlePayment(p.id, "failure")).toBe("FAILED");
        expect((await claims(b.id)).map((c) => c.expiresAt)).toEqual([b.holdExpiresAt]);
        expect((await booking(code)).paymentStatus).toBe("FAILED");
    });

    it("cancelled payment (customer cancelled on the bKash page)", async () => {
        const { code, b, p } = await startedCheckout();
        expect(await settlePayment(p.id, "cancel")).toBe("FAILED");
        expect((await claims(b.id)).map((c) => c.expiresAt)).toEqual([b.holdExpiresAt]);
        expect((await booking(code)).paymentStatus).toBe("CANCELLED");
    });

    it("abandoned payment (reconcile job, customer never came back)", async () => {
        const { b, p } = await startedCheckout();
        const later = new Date(Date.parse(p.createdAt) + 13 * 60_000);
        expect(await settlePayment(p.id, "reconcile", later)).toBe("FAILED");
        expect((await claims(b.id)).map((c) => c.expiresAt)).toEqual([b.holdExpiresAt]);
    });

    it("bKash could not be opened (create failed)", async () => {
        const dto = await createBooking(user, { pitchId: "bogura-b", cellStarts: [await noon()], phone: user.phone });
        vi.mocked(bkashCreate).mockRejectedValue(new Error("bKash down"));
        await expect(startBkashPayment(user, dto.code)).rejects.toMatchObject({ code: "PAYMENT_START_FAILED" });
        const b = await booking(dto.code);
        expect((await claims(b.id)).map((c) => c.expiresAt)).toEqual([b.holdExpiresAt]);
        expect(b.paymentStatus).toBe("NOT_STARTED");
    });

    it("unverifiable payment (amount mismatch) counts as no payment too", async () => {
        const { b, p } = await startedCheckout();
        vi.mocked(bkashExecute).mockResolvedValue({ state: "COMPLETED", paymentId: p.providerPaymentId, trxId: "TRX-BAD", amount: p.amount + 1, currency: "BDT", invoice: p.invoice });
        expect(await settlePayment(p.id, "success")).toBe("FAILED");
        expect((await claims(b.id)).map((c) => c.expiresAt)).toEqual([b.holdExpiresAt]);
    });
});

describe("successful payment is unchanged", () => {
    it("the extension protects the slot during checkout, and a verified payment books it", async () => {
        const { code, b, p } = await startedCheckout();
        // One minute after the original hold ran out (still inside the extension) the payment completes.
        const late = new Date(Date.parse(b.holdExpiresAt) + 60_000);
        vi.mocked(bkashExecute).mockResolvedValue({ state: "COMPLETED", paymentId: p.providerPaymentId, trxId: "TRX-OK", amount: p.amount, currency: "BDT", invoice: p.invoice });
        expect(await settlePayment(p.id, "success", late)).toBe("CONFIRMED");
        const [c] = await claims(b.id);
        expect(c.state).toBe("BOOKED");
        expect((await booking(code)).bookingStatus).toBe("CONFIRMED");
    });
});

describe("duplicate and late settlements", () => {
    it("settling the same failure twice (and concurrently) leaves the claims consistent", async () => {
        const { b, p } = await startedCheckout();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "FAILED" });
        await Promise.all([settlePayment(p.id, "failure"), settlePayment(p.id, "cancel")]);
        await settlePayment(p.id, "failure");
        const cs = await claims(b.id);
        expect(cs).toHaveLength(1);
        expect(cs[0]).toMatchObject({ state: "HELD", expiresAt: b.holdExpiresAt });
    });

    it("a late duplicate callback for an OLD failed attempt cannot shorten a NEW attempt's extension", async () => {
        const { code, b, p } = await startedCheckout();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "FAILED" });
        await settlePayment(p.id, "failure");
        // Customer retries within the hold: a new checkout extends the claims again.
        vi.mocked(bkashCreate).mockResolvedValue({ paymentId: "PID2", redirectUrl: "https://sandbox.payment.bkash.com/y" });
        await startBkashPayment(user, code);
        const extended = (await claims(b.id))[0].expiresAt!;
        expect(extended > b.holdExpiresAt).toBe(true);
        // bKash re-sends the first attempt's callback.
        await settlePayment(p.id, "failure");
        expect((await claims(b.id))[0].expiresAt).toBe(extended);
    });
});

describe("missing, expired or released claims stay safe", () => {
    it("a claim already at or before the hold expiry is never extended", async () => {
        const { b, p } = await startedCheckout();
        const earlier = new Date(Date.parse(b.holdExpiresAt) - 5 * 60_000).toISOString();
        await SlotClaimModel.updateMany({ bookingId: b.id }, { $set: { expiresAt: earlier } });
        await settlePayment(p.id, "cancel");
        expect((await claims(b.id)).map((c) => c.expiresAt)).toEqual([earlier]);
    });

    it("released claims: the failure settles without error and nothing is recreated", async () => {
        const { code, b, p } = await startedCheckout();
        await SlotClaimModel.deleteMany({ bookingId: b.id });
        expect(await settlePayment(p.id, "cancel")).toBe("FAILED");
        expect(await claims(b.id)).toHaveLength(0);
        expect((await booking(code)).paymentStatus).toBe("CANCELLED");
    });

    it("other bookings' claims are untouched", async () => {
        const other = await createBooking({ ...user, id: "u-other", phone: "01722222222" }, { pitchId: "bogura-b", cellStarts: [await noon(15)], phone: "01722222222" });
        const otherB = await booking(other.code);
        const before = (await claims(otherB.id))[0].expiresAt;
        const { p } = await startedCheckout();
        await settlePayment(p.id, "cancel");
        expect((await claims(otherB.id))[0].expiresAt).toBe(before);
    });
});
