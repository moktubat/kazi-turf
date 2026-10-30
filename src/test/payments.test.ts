// Money-path tests: verified confirmation, idempotency, mismatch, late success, retries, double tap.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payments/bkash", () => ({
    bkashConfigured: () => true,
    bkashCreate: vi.fn(),
    bkashExecute: vi.fn(),
    bkashQuery: vi.fn(),
}));

import { addDays, dhakaToUtc, todayDhaka } from "@/lib/time";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { bkashCreate, bkashExecute, bkashQuery, type RemotePayment } from "@/server/payments/bkash";
import { settlePayment } from "@/server/payments/settle";
import { startBkashPayment } from "@/server/payments/start";
import { store } from "@/server/store";
import type { Payment } from "@/types/ops";

const user: ServerUser = {
    id: "u-test",
    name: "Test Customer",
    role: "CUSTOMER",
    phone: "01711111111",
    email: null,
    branchIds: [],
    permissions: [],
};

const cell = () => dhakaToUtc(addDays(todayDhaka(), 1), 12 * 60).toISOString(); // tomorrow 12:00

const done = (p: Payment, over: Partial<RemotePayment> = {}): RemotePayment => ({
    state: "COMPLETED",
    paymentId: p.providerPaymentId,
    trxId: "TRX1",
    amount: p.amount,
    currency: "BDT",
    invoice: p.invoice,
    ...over,
});

async function setup() {
    const dto = createBooking(user, { pitchId: "bogura-b", cellStarts: [cell()], phone: "01711111111" });
    await startBkashPayment(user, dto.code);
    const booking = store.bookings.find((b) => b.bookingCode === dto.code)!;
    return { booking, payment: store.payments[0] };
}

beforeEach(() => {
    process.env.AUTH_URL = "http://localhost:3000";
    store.bookings = [];
    store.claims = [];
    store.payments = [];
    store.auditLogs = [];
    vi.mocked(bkashCreate).mockReset().mockResolvedValue({ paymentId: "PID1", redirectUrl: "https://sandbox.payment.bkash.com/x" });
    vi.mocked(bkashExecute).mockReset();
    vi.mocked(bkashQuery).mockReset().mockResolvedValue({ state: "UNKNOWN" });
});

describe("bKash advance", () => {
    it("confirms only after bKash verifies the payment", async () => {
        const { booking, payment } = await setup();
        expect(booking.paymentStatus).toBe("PENDING");
        expect(booking.bookingStatus).toBe("PENDING_PAYMENT");

        vi.mocked(bkashExecute).mockResolvedValue(done(payment));
        expect(await settlePayment(payment.id, "success")).toBe("CONFIRMED");

        expect(booking.bookingStatus).toBe("CONFIRMED");
        expect(booking.paymentStatus).toBe("PARTIALLY_PAID");
        expect(payment.status).toBe("SUCCESS");
        expect(store.claims[0]).toMatchObject({ state: "BOOKED" });
        expect(store.claims[0].expiresAt).toBeUndefined();
    });

    it("does not confirm on a success redirect that bKash does not back up", async () => {
        const { booking, payment } = await setup();
        vi.mocked(bkashExecute).mockResolvedValue({ state: "OPEN" });
        vi.mocked(bkashQuery).mockResolvedValue({ state: "OPEN" });

        expect(await settlePayment(payment.id, "success")).toBe("PENDING");
        expect(booking.bookingStatus).toBe("PENDING_PAYMENT");
        expect(booking.paymentStatus).toBe("PENDING");
    });

    it("is idempotent: duplicate callbacks verify once and record one payment", async () => {
        const { booking, payment } = await setup();
        vi.mocked(bkashExecute).mockResolvedValue(done(payment));

        const [a, b] = await Promise.all([settlePayment(payment.id, "success"), settlePayment(payment.id, "success")]);
        const c = await settlePayment(payment.id, "success"); // a later duplicate

        expect([a, b, c]).toEqual(["CONFIRMED", "CONFIRMED", "CONFIRMED"]);
        expect(bkashExecute).toHaveBeenCalledTimes(1);
        expect(store.payments.filter((p) => p.status === "SUCCESS")).toHaveLength(1);
        expect(booking.paymentStatus).toBe("PARTIALLY_PAID");
    });

    it("rejects an amount that differs from the server-calculated advance", async () => {
        const { booking, payment } = await setup();
        vi.mocked(bkashExecute).mockResolvedValue(done(payment, { amount: payment.amount + 1 }));

        expect(await settlePayment(payment.id, "success")).toBe("FAILED");
        expect(booking.bookingStatus).toBe("PENDING_PAYMENT");
        expect(booking.paymentStatus).toBe("FAILED");
        expect(payment.anomaly).toBeTruthy(); // surfaces in Insights > Needs attention
    });

    it("late success with the cells still free re-claims and confirms", async () => {
        const { booking, payment } = await setup();
        booking.holdExpiresAt = new Date(Date.now() - 60_000).toISOString();
        store.claims = []; // hold released and cleaned up
        vi.mocked(bkashExecute).mockResolvedValue(done(payment));

        expect(await settlePayment(payment.id, "success")).toBe("CONFIRMED");
        expect(booking.bookingStatus).toBe("CONFIRMED");
        expect(store.claims).toHaveLength(1);
        expect(store.claims[0]).toMatchObject({ state: "BOOKED", bookingId: booking.id });
    });

    it("late success after someone else took the slot becomes REFUND_PENDING", async () => {
        const { booking, payment } = await setup();
        booking.holdExpiresAt = new Date(Date.now() - 60_000).toISOString();
        store.claims = [{ pitchId: "bogura-b", cellStart: cell(), state: "BOOKED", bookingId: "someone-else" }];
        vi.mocked(bkashExecute).mockResolvedValue(done(payment));

        expect(await settlePayment(payment.id, "success")).toBe("REFUND");
        expect(booking.paymentStatus).toBe("REFUND_PENDING");
        expect(booking.bookingStatus).toBe("EXPIRED");
        expect(payment.status).toBe("SUCCESS"); // the money is recorded, never silently kept
        expect(store.claims).toHaveLength(1); // the other customer keeps their slot
        expect(store.claims[0].bookingId).toBe("someone-else");
    });

    it("a cancelled checkout can be retried while the hold is alive", async () => {
        const { booking, payment } = await setup();
        vi.mocked(bkashQuery).mockResolvedValue({ state: "OPEN" });

        expect(await settlePayment(payment.id, "cancel")).toBe("FAILED");
        expect(booking.paymentStatus).toBe("CANCELLED");
        expect(bkashExecute).not.toHaveBeenCalled();

        await startBkashPayment(user, booking.bookingCode);
        expect(store.payments).toHaveLength(2);
        expect(booking.paymentStatus).toBe("PENDING");
    });

    it("a double tap on Pay starts only one attempt", async () => {
        const dto = createBooking(user, { pitchId: "bogura-b", cellStarts: [cell()], phone: "01711111111" });
        const results = await Promise.allSettled([startBkashPayment(user, dto.code), startBkashPayment(user, dto.code)]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
        expect(store.payments).toHaveLength(1);
        expect(bkashCreate).toHaveBeenCalledTimes(1);
    });
});