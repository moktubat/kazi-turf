// Money-path tests against real MongoDB: verified confirmation, idempotency, mismatch, late success,
// retries and double tap. Only the bKash HTTP layer is mocked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payments/bkash", () => ({
    bkashConfigured: () => true,
    bkashCreate: vi.fn(),
    bkashExecute: vi.fn(),
    bkashQuery: vi.fn(),
}));

import { addDays, dhakaToUtc } from "@/lib/time";
import { BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { plain } from "@/server/db/util";
import { bkashCreate, bkashExecute, bkashQuery, type RemotePayment } from "@/server/payments/bkash";
import { settlePayment } from "@/server/payments/settle";
import { startBkashPayment } from "@/server/payments/start";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { resetDb, startDb, stopDb } from "./helpers";
import { todayDhaka } from "@/lib/time.server";

const user: ServerUser = {
    id: "u-test",
    name: "Test Customer",
    role: "CUSTOMER",
    phone: "01711111111",
    email: null,
    branchIds: [],
    permissions: [],
};

const cell = async () => {
    const today = await todayDhaka(new Date());
    const tomorrow = addDays(today, 1);

    return dhakaToUtc(tomorrow, 12 * 60).toISOString();
};

const done = (p: Payment, over: Partial<RemotePayment> = {}): RemotePayment => ({
    state: "COMPLETED",
    paymentId: p.providerPaymentId,
    trxId: "TRX1",
    amount: p.amount,
    currency: "BDT",
    invoice: p.invoice,
    ...over,
});

const getBooking = async (code: string) =>
    plain<Booking>(await BookingModel.findOne({ bookingCode: code }).lean());
const getPayment = async (id: string) => plain<Payment>(await PaymentModel.findOne({ id }).lean());

async function setup() {
    const dto = await createBooking(user, { pitchId: "bogura-b", cellStarts: [await cell()], phone: "01711111111" });
    await startBkashPayment(user, dto.code);
    const payment = plain<Payment>(await PaymentModel.findOne({}).lean());
    return { code: dto.code, payment };
}

beforeAll(startDb, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    process.env.AUTH_URL = "http://localhost:3000";
    vi.mocked(bkashCreate).mockReset().mockResolvedValue({ paymentId: "PID1", redirectUrl: "https://sandbox.payment.bkash.com/x" });
    vi.mocked(bkashExecute).mockReset();
    vi.mocked(bkashQuery).mockReset().mockResolvedValue({ state: "UNKNOWN" });
});

describe("bKash advance", () => {
    it("confirms only after bKash verifies the payment", async () => {
        const { code, payment } = await setup();
        const before = await getBooking(code);
        expect(before.paymentStatus).toBe("PENDING");
        expect(before.bookingStatus).toBe("PENDING_PAYMENT");

        vi.mocked(bkashExecute).mockResolvedValue(done(payment));
        expect(await settlePayment(payment.id, "success")).toBe("CONFIRMED");

        const b = await getBooking(code);
        expect(b.bookingStatus).toBe("CONFIRMED");
        expect(b.paymentStatus).toBe("PARTIALLY_PAID");
        expect((await getPayment(payment.id)).status).toBe("SUCCESS");

        const claims = await SlotClaimModel.find({}).lean<any[]>();
        expect(claims[0]).toMatchObject({ state: "BOOKED" });
        expect(claims[0].expiresAt).toBeUndefined();
    });

    it("does not confirm on a success redirect that bKash does not back up", async () => {
        const { code, payment } = await setup();
        vi.mocked(bkashExecute).mockResolvedValue({ state: "OPEN" });
        vi.mocked(bkashQuery).mockResolvedValue({ state: "OPEN" });

        expect(await settlePayment(payment.id, "success")).toBe("PENDING");
        const b = await getBooking(code);
        expect(b.bookingStatus).toBe("PENDING_PAYMENT");
        expect(b.paymentStatus).toBe("PENDING");
    });

    it("is idempotent: duplicate callbacks verify once and record one payment", async () => {
        const { code, payment } = await setup();
        vi.mocked(bkashExecute).mockResolvedValue(done(payment));

        const [a, b] = await Promise.all([settlePayment(payment.id, "success"), settlePayment(payment.id, "success")]);
        const c = await settlePayment(payment.id, "success"); // a later duplicate

        expect([a, b, c]).toEqual(["CONFIRMED", "CONFIRMED", "CONFIRMED"]);
        expect(bkashExecute).toHaveBeenCalledTimes(1);
        expect(await PaymentModel.countDocuments({ status: "SUCCESS" })).toBe(1);
        expect((await getBooking(code)).paymentStatus).toBe("PARTIALLY_PAID");
    });

    it("rejects an amount that differs from the server-calculated advance", async () => {
        const { code, payment } = await setup();
        vi.mocked(bkashExecute).mockResolvedValue(done(payment, { amount: payment.amount + 1 }));

        expect(await settlePayment(payment.id, "success")).toBe("FAILED");
        const b = await getBooking(code);
        expect(b.bookingStatus).toBe("PENDING_PAYMENT");
        expect(b.paymentStatus).toBe("FAILED");
        expect((await getPayment(payment.id)).anomaly).toBeTruthy(); // surfaces in Insights > Needs attention
    });

    it("rejects a transaction ID that was already recorded", async () => {
        const { code, payment } = await setup();
        await PaymentModel.create({
            id: "other", bookingId: "other-booking", provider: "BKASH", kind: "ADVANCE", amount: 1,
            currency: "BDT", status: "SUCCESS", providerTxnId: "TRX1", createdAt: new Date().toISOString(),
        });
        vi.mocked(bkashExecute).mockResolvedValue(done(payment));

        expect(await settlePayment(payment.id, "success")).toBe("FAILED");
        expect((await getBooking(code)).bookingStatus).toBe("PENDING_PAYMENT");
    });

    it("late success with the cells still free re-claims and confirms", async () => {
        const { code, payment } = await setup();
        await BookingModel.updateOne({ bookingCode: code }, { holdExpiresAt: new Date(Date.now() - 60_000).toISOString() });
        await SlotClaimModel.deleteMany({}); // hold released and cleaned up
        vi.mocked(bkashExecute).mockResolvedValue(done(payment));

        expect(await settlePayment(payment.id, "success")).toBe("CONFIRMED");
        const b = await getBooking(code);
        expect(b.bookingStatus).toBe("CONFIRMED");

        const claims = await SlotClaimModel.find({}).lean<any[]>();
        expect(claims).toHaveLength(1);
        expect(claims[0]).toMatchObject({ state: "BOOKED", bookingId: b.id });
    });

    it("late success after someone else took the slot becomes REFUND_PENDING", async () => {
        const { code, payment } = await setup();
        await BookingModel.updateOne({ bookingCode: code }, { holdExpiresAt: new Date(Date.now() - 60_000).toISOString() });
        await SlotClaimModel.deleteMany({});
        await SlotClaimModel.create({ pitchId: "bogura-b", cellStart: await cell(), state: "BOOKED", bookingId: "someone-else" });
        vi.mocked(bkashExecute).mockResolvedValue(done(payment));

        expect(await settlePayment(payment.id, "success")).toBe("REFUND");
        const b = await getBooking(code);
        expect(b.paymentStatus).toBe("REFUND_PENDING");
        expect(b.bookingStatus).toBe("EXPIRED");
        expect((await getPayment(payment.id)).status).toBe("SUCCESS"); // the money is recorded, never silently kept

        const claims = await SlotClaimModel.find({}).lean<any[]>();
        expect(claims).toHaveLength(1); // the other customer keeps their slot
        expect(claims[0].bookingId).toBe("someone-else");
    });

    it("a cancelled checkout can be retried while the hold is alive", async () => {
        const { code, payment } = await setup();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "OPEN" });

        expect(await settlePayment(payment.id, "cancel")).toBe("FAILED");
        expect((await getBooking(code)).paymentStatus).toBe("CANCELLED");
        expect(bkashExecute).not.toHaveBeenCalled();

        await startBkashPayment(user, code);
        expect(await PaymentModel.countDocuments({})).toBe(2);
        expect((await getBooking(code)).paymentStatus).toBe("PENDING");
    });

    it("a double tap on Pay starts only one attempt", async () => {
        const dto = await createBooking(user, { pitchId: "bogura-b", cellStarts: [await cell()], phone: "01711111111" });
        const results = await Promise.allSettled([startBkashPayment(user, dto.code), startBkashPayment(user, dto.code)]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
        expect(await PaymentModel.countDocuments({})).toBe(1);
        expect(bkashCreate).toHaveBeenCalledTimes(1);
    });
});