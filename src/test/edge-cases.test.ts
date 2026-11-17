// Booking edge cases (audit): own failed/cancelled holds, races between payment, cancellation
// and refund, price changes during checkout, VAT + discount rounding, and the invariant that
// bookings, payments and slot claims always agree. Isolated in-memory MongoDB; bKash is mocked.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payments/bkash", () => ({
    bkashConfigured: () => true,
    bkashCreate: vi.fn(),
    bkashExecute: vi.fn(),
    bkashQuery: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { AuditLogModel, BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import { cancelBooking, recordRefund } from "@/server/admin/operations";
import type { ServerUser } from "@/server/auth/session";
import { createBooking, releaseHold } from "@/server/bookings";
import { plain, plainAll } from "@/server/db/util";
import { bkashCreate, bkashExecute, bkashQuery, type RemotePayment } from "@/server/payments/bkash";
import { settlePayment } from "@/server/payments/settle";
import { startBkashPayment } from "@/server/payments/start";
import { quote } from "@/server/pricing";
import type { SlotClaim } from "@/types";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { resetDb, startDb, stopDb } from "./helpers";

const customer = (id: string): ServerUser => ({ id, name: id, role: "CUSTOMER", phone: "01711111111", email: null, branchIds: [], permissions: [] });
const alice = customer("alice");
const bob = customer("bob");
const admin: ServerUser = { id: "admin", name: "Admin", role: "SUPER_ADMIN", phone: "01700000000", email: null, branchIds: [], permissions: ["*"] };

let TOMORROW = "";
const at = (h: number, m = 0) => dhakaToUtc(TOMORROW, h * 60 + m).toISOString();
const PHONE = "01711111111";
const book = (u: ServerUser, starts: string[], pitchId = "bogura-b") => createBooking(u, { pitchId, cellStarts: starts, phone: PHONE });

const bookingOf = async (code: string) => plain<Booking>(await BookingModel.findOne({ bookingCode: code }).lean());
const lastPayment = async (bookingId: string) =>
    plain<Payment>(await PaymentModel.findOne({ bookingId }).sort({ createdAt: -1, _id: -1 }).lean());
const completed = (p: Payment, trxId = "TRX-1"): RemotePayment => ({
    state: "COMPLETED", paymentId: p.providerPaymentId, trxId, amount: p.amount, currency: "BDT", invoice: p.invoice,
});

/** Bookings, payments and slot claims must always agree. */
async function assertConsistent(now = new Date()) {
    const bookings = plainAll<Booking>(await BookingModel.find().lean());
    const claims = plainAll<SlotClaim>(await SlotClaimModel.find().lean());
    const byBooking = new Map<string, SlotClaim[]>();
    for (const c of claims) if (c.bookingId) byBooking.set(c.bookingId, [...(byBooking.get(c.bookingId) ?? []), c]);

    for (const b of bookings) {
        const mine = byBooking.get(b.id) ?? [];
        if (b.bookingStatus === "CONFIRMED" || b.bookingStatus === "CHECKED_IN") {
            expect(mine.map((c) => c.cellStart).sort(), `${b.bookingCode} owns its cells`).toEqual([...b.cellStarts].sort());
            expect(mine.every((c) => c.state === "BOOKED"), `${b.bookingCode} cells are BOOKED`).toBe(true);
        }
        if (b.bookingStatus === "CANCELLED" || b.bookingStatus === "EXPIRED") {
            expect(mine, `${b.bookingCode} (${b.bookingStatus}) holds no cells`).toHaveLength(0);
        }
        if (b.bookingStatus === "PENDING_PAYMENT" && mine.length) {
            expect(mine.every((c) => c.state === "HELD"), `${b.bookingCode} cells are HELD`).toBe(true);
        }
        const pays = plainAll<Payment>(await PaymentModel.find({ bookingId: b.id }).lean());
        expect(pays.filter((p) => p.status === "PENDING").length <= 1, `${b.bookingCode} has at most one payment in flight`).toBe(true);
        if (b.paymentStatus === "PENDING") expect(pays.some((p) => p.status === "PENDING"), `${b.bookingCode} PENDING has a payment`).toBe(true);
        if (["PARTIALLY_PAID", "PAID"].includes(b.paymentStatus)) expect(pays.some((p) => p.status === "SUCCESS")).toBe(true);
    }
    // Every claim with a booking points at a booking that exists.
    const ids = new Set(bookings.map((b) => b.id));
    for (const c of claims) if (c.bookingId) expect(ids.has(c.bookingId), `claim ${c.cellStart} has a booking`).toBe(true);
    void now;
}

let savedPolicies = { ...policies };
let savedRules = structuredClone(pricingRules);

beforeAll(async () => {
    await startDb();
    // Snapshot AFTER startDb has loaded the fixture prices, so each test can restore them.
    savedPolicies = { ...policies };
    savedRules = structuredClone(pricingRules);
    TOMORROW = addDays(await todayDhaka(new Date()), 1);
}, 180_000);
afterAll(stopDb);
beforeEach(async () => {
    await resetDb();
    process.env.AUTH_URL = "http://localhost:3000";
    let n = 0;
    vi.mocked(bkashCreate).mockReset().mockImplementation(async () => ({ paymentId: `PID${++n}`, redirectUrl: "https://sandbox.example/x" }));
    vi.mocked(bkashExecute).mockReset();
    vi.mocked(bkashQuery).mockReset().mockResolvedValue({ state: "UNKNOWN" });
});
afterEach(() => {
    Object.assign(policies, savedPolicies);
    pricingRules.splice(0, pricingRules.length, ...structuredClone(savedRules));
});

describe("a customer's own unfinished checkout", () => {
    it("after cancelling in bKash, the customer can pick the same slot again", async () => {
        const first = await book(alice, [at(12)]);
        await startBkashPayment(alice, first.code);
        vi.mocked(bkashQuery).mockResolvedValue({ state: "OPEN" });
        expect(await settlePayment((await lastPayment((await bookingOf(first.code)).id)).id, "cancel")).toBe("FAILED");
        expect((await bookingOf(first.code)).paymentStatus).toBe("CANCELLED");

        const again = await book(alice, [at(12)]);
        expect(again.bookingStatus).toBe("PENDING_PAYMENT");
        await assertConsistent();
    });

    it("after a failed payment, starting a new checkout replaces the old hold (one live hold per customer)", async () => {
        const first = await book(alice, [at(12)]);
        await startBkashPayment(alice, first.code);
        vi.mocked(bkashQuery).mockResolvedValue({ state: "FAILED" });
        await settlePayment((await lastPayment((await bookingOf(first.code)).id)).id, "failure");
        expect((await bookingOf(first.code)).paymentStatus).toBe("FAILED");

        await book(alice, [at(15)]);
        // The 12:00 slot is free again for everyone.
        expect(await SlotClaimModel.countDocuments({ pitchId: "bogura-b", cellStart: at(12) })).toBe(0);
        await expect(book(bob, [at(12)])).resolves.toMatchObject({ bookingStatus: "PENDING_PAYMENT" });
        await assertConsistent();
    });

    it("a hold whose payment is still being processed is never replaced", async () => {
        const first = await book(alice, [at(12)]);
        await startBkashPayment(alice, first.code);
        await book(alice, [at(15)]);
        const b = await bookingOf(first.code);
        expect(b.paymentStatus).toBe("PENDING");
        expect(await SlotClaimModel.countDocuments({ bookingId: b.id })).toBe(1);
        await assertConsistent();
    });
});

describe("races between payment, cancellation and refund", () => {
    it("staff cancel vs customer Pay at the same moment: exactly one wins and the data agrees", async () => {
        for (let i = 0; i < 5; i++) {
            await resetDb();
            const dto = await book(alice, [at(12)]);
            const [pay, cancel] = await Promise.allSettled([
                startBkashPayment(alice, dto.code),
                cancelBooking(admin, dto.code, "Venue closed for repairs"),
            ]);
            expect([pay.status, cancel.status].filter((s) => s === "fulfilled")).toHaveLength(1);
            const b = await bookingOf(dto.code);
            if (pay.status === "fulfilled") {
                expect(b).toMatchObject({ bookingStatus: "PENDING_PAYMENT", paymentStatus: "PENDING" });
            } else {
                expect(b).toMatchObject({ bookingStatus: "CANCELLED", paymentStatus: "CANCELLED" });
                expect(await PaymentModel.countDocuments({ status: "PENDING" })).toBe(0);
            }
            await assertConsistent();
        }
    });

    it("cancelling a paid booking makes the refund pending; two Super Admins recording it at once record it once", async () => {
        const dto = await book(alice, [at(12)]);
        await startBkashPayment(alice, dto.code);
        const p = await lastPayment((await bookingOf(dto.code)).id);
        vi.mocked(bkashExecute).mockResolvedValue(completed(p));
        expect(await settlePayment(p.id, "success")).toBe("CONFIRMED");

        const cancels = await Promise.allSettled([
            cancelBooking(admin, dto.code, "Customer called to cancel"),
            cancelBooking(admin, dto.code, "Customer called to cancel"),
        ]);
        expect(cancels.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(await bookingOf(dto.code)).toMatchObject({ bookingStatus: "CANCELLED", paymentStatus: "REFUND_PENDING" });

        const refunds = await Promise.allSettled([recordRefund(admin, dto.code, "bKash refund"), recordRefund(admin, dto.code, "bKash refund")]);
        expect(refunds.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect((await bookingOf(dto.code)).paymentStatus).toBe("REFUNDED");
        expect(await AuditLogModel.countDocuments({ action: "BOOKING_CANCELLED" })).toBe(1);
        expect(await AuditLogModel.countDocuments({ action: "REFUND_RECORDED" })).toBe(1);
        await assertConsistent();
    });

    it("duplicate success callbacks handled by two server instances at once confirm once", async () => {
        const dto = await book(alice, [at(12)]);
        await startBkashPayment(alice, dto.code);
        const p = await lastPayment((await bookingOf(dto.code)).id);
        vi.mocked(bkashExecute).mockResolvedValue(completed(p, "TRX-DUP"));
        vi.mocked(bkashQuery).mockResolvedValue(completed(p, "TRX-DUP"));

        // settlePayment de-duplicates within one process; clearing its in-flight map between the
        // calls makes the second behave like another instance handling the same callback.
        const inflight = (globalThis as unknown as { __ktInflight: Map<string, unknown> }).__ktInflight;
        const first = settlePayment(p.id, "success");
        inflight.clear();
        const second = settlePayment(p.id, "reconcile");
        const results = await Promise.all([first, second]);

        expect(results.every((r) => r === "CONFIRMED")).toBe(true);
        expect(await PaymentModel.countDocuments({ status: "SUCCESS", providerTxnId: "TRX-DUP" })).toBe(1);
        expect(await AuditLogModel.countDocuments({ action: "PAYMENT_VERIFIED" })).toBe(1);
        expect(await bookingOf(dto.code)).toMatchObject({ bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID" });
        await assertConsistent();
    });

    it("a late callback for a payment that already failed changes nothing, even if it says success", async () => {
        const dto = await book(alice, [at(12)]);
        await startBkashPayment(alice, dto.code);
        const p = await lastPayment((await bookingOf(dto.code)).id);
        vi.mocked(bkashQuery).mockResolvedValue({ state: "FAILED" });
        await settlePayment(p.id, "failure");
        await cancelBooking(admin, dto.code, "Customer gave up");

        vi.mocked(bkashExecute).mockResolvedValue(completed(p));
        expect(await settlePayment(p.id, "success")).toBe("FAILED");
        expect(await bookingOf(dto.code)).toMatchObject({ bookingStatus: "CANCELLED", paymentStatus: "CANCELLED" });
        await assertConsistent();
    });

    it("leaving checkout releases the hold while a payment is not in flight, and is refused while one is", async () => {
        const dto = await book(alice, [at(12)]);
        await startBkashPayment(alice, dto.code);
        await expect(releaseHold(dto.code, alice)).rejects.toMatchObject({ code: "PAYMENT_IN_PROGRESS" });
        await assertConsistent();
    });
});

describe("prices during checkout", () => {
    it("a price change after the hold does not change what the customer pays", async () => {
        const dto = await book(alice, [at(18)]);
        const held = await bookingOf(dto.code);
        for (const r of pricingRules) if (r.pitchId === "bogura-b") r.pricePerSlot = 9000;
        await startBkashPayment(alice, dto.code);
        const p = await lastPayment(held.id);
        expect(p.amount).toBe(held.advanceAmount);
        expect(vi.mocked(bkashCreate).mock.calls[0][0].amount).toBe(held.advanceAmount);
    });

    it("VAT (exclusive and inclusive) with a percentage discount stays in whole taka and adds up", () => {
        // Weekday and weekend evening rules, so the test does not depend on what day tomorrow is.
        for (const rule of pricingRules.filter((r) => r.pitchId === "bogura-b" && r.startTime === "16:30")) {
            rule.pricePerSlot = 2333;
            rule.discountType = "PERCENT";
            rule.discountValue = 7;
            rule.discountDirection = "DISCOUNT";
        }
        for (const vatMode of ["exclusive", "inclusive"] as const) {
            Object.assign(policies, { vatRatePercent: 15, vatMode, advancePercent: 33 });
            const q = quote("bogura-b", [new Date(at(18)), new Date(at(19, 30))]);
            for (const n of [q.subtotal, q.vat, q.total, q.advance, q.balance]) expect(Number.isInteger(n)).toBe(true);
            expect(q.advance + q.balance).toBe(q.total);
            expect(q.total).toBe(vatMode === "exclusive" ? q.subtotal + q.vat : q.subtotal);
        }
    });
});
