// Walk-in counter discount: a fixed taka amount or a percentage off the subtotal, checked
// on the server with the same code the form previews with. The discounted total is what
// the booking, its balance, cash validation, collection and summaries all use.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { branches } from "@/data/branches";
import { applyCounterDiscount, counterDiscountAmount, counterDiscountError } from "@/lib/counterDiscount";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { receiptHtml } from "@/lib/printReceipt";
import { BookingModel, PaymentModel } from "@/models";
import { walkInSchema } from "@/schemas/admin";
import { collectBalance } from "@/server/admin/operations";
import { bookingsCsv } from "@/server/admin/search";
import { createWalkIn, quoteWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import { bookingConfirmationTemplate } from "@/server/email/templates";
import type { Booking } from "@/types/booking";
import { startDb, stopDb } from "./helpers";

const mk = (id: string, role: ServerUser["role"], branchIds: string[] = []): ServerUser => ({
    id, name: id, role, phone: "01354490362", email: null, branchIds, permissions: [],
});
const staff = mk("staff-bogura", "STAFF", ["bogura"]);
const admin = mk("admin", "SUPER_ADMIN");

const Q = { subtotal: 2000, vat: 0, total: 2000, advancePercent: 30, vatRatePercent: null, vatMode: "exclusive" as const };

describe("discount calculation", () => {
    it("fixed taka and percent come off the subtotal", () => {
        expect(applyCounterDiscount(Q, { type: "FIXED", value: 300 })).toMatchObject({ discountAmount: 300, total: 1700, originalTotal: 2000, advance: 510 });
        expect(applyCounterDiscount(Q, { type: "PERCENT", value: 10 })).toMatchObject({ discountAmount: 200, total: 1800, advance: 540 });
    });

    it("no discount, 0 or blank changes nothing", () => {
        expect(applyCounterDiscount(Q, null)).toMatchObject({ discountAmount: 0, total: 2000, advance: 600 });
        expect(applyCounterDiscount(Q, { type: "FIXED", value: 0 })).toMatchObject({ discountAmount: 0, total: 2000 });
    });

    it("a full discount brings the payable total to ৳0, never below", () => {
        expect(applyCounterDiscount(Q, { type: "PERCENT", value: 100 })).toMatchObject({ total: 0, advance: 0 });
        expect(applyCounterDiscount(Q, { type: "FIXED", value: 2000 })).toMatchObject({ total: 0 });
        expect(counterDiscountAmount({ type: "FIXED", value: 5000 }, 2000)).toBe(2000); // clamped even if unchecked
    });

    it("percent rounds to whole taka", () => {
        expect(counterDiscountAmount({ type: "PERCENT", value: 15 }, 1999)).toBe(300);
    });

    it("VAT is worked out again on the discounted amount", () => {
        const exclusive = { ...Q, vatRatePercent: 10, vat: 200, total: 2200 };
        expect(applyCounterDiscount(exclusive, { type: "FIXED", value: 1000 })).toMatchObject({ vat: 100, total: 1100, originalTotal: 2200 });
        const inclusive = { ...Q, vatRatePercent: 10, vatMode: "inclusive" as const, vat: 182, total: 2000 };
        expect(applyCounterDiscount(inclusive, { type: "FIXED", value: 900 })).toMatchObject({ vat: 100, total: 1100 });
    });

    it("rejects amounts that would make the total negative, and bad values", () => {
        expect(counterDiscountError({ type: "FIXED", value: 2001 }, 2000)).toMatch(/At most ৳2,000/);
        expect(counterDiscountError({ type: "PERCENT", value: 101 }, 2000)).toBe("At most 100%");
        expect(counterDiscountError({ type: "FIXED", value: -1 }, 2000)).toMatch(/0 or more/);
        expect(counterDiscountError({ type: "PERCENT", value: 12.5 }, 2000)).toMatch(/whole number/);
        expect(counterDiscountError({ type: "FIXED", value: 2000 }, 2000)).toBeNull();
        expect(counterDiscountError(undefined, 2000)).toBeNull();
    });

    it("the request schema rejects negatives and percentages over 100", () => {
        const base = { pitchId: "bogura-b", cellStarts: ["2026-11-20T12:00:00.000Z"], phone: "01755556666", name: "Karim", cashReceived: 0 };
        expect(walkInSchema.safeParse({ ...base, discount: { type: "FIXED", value: 200 } }).success).toBe(true);
        expect(walkInSchema.safeParse({ ...base, discount: { type: "PERCENT", value: 100 } }).success).toBe(true);
        expect(walkInSchema.safeParse({ ...base, discount: { type: "FIXED", value: -5 } }).success).toBe(false);
        expect(walkInSchema.safeParse({ ...base, discount: { type: "PERCENT", value: 120 } }).success).toBe(false);
        expect(walkInSchema.safeParse({ ...base, discount: { type: "OTHER", value: 1 } }).success).toBe(false);
        expect(walkInSchema.safeParse(base).success).toBe(true); // discount stays optional
    });
});

describe("walk-in booking with a discount", () => {
    let cell: (h: number) => string;
    beforeAll(async () => {
        await startDb();
        const today = await todayDhaka(new Date());
        cell = (h: number) => dhakaToUtc(addDays(today, 3), h * 60).toISOString();
        // Football keeps a 30% advance for the suggestion maths below.
        Object.assign(branches[0].sportConfigs.find((s) => s.name === "Football")!, { advancePercent: 30, nightAdvancePercent: 30 });
    }, 180_000);
    afterAll(stopDb);

    const walkIn = (h: number, cashReceived: number, discount?: { type: "FIXED" | "PERCENT"; value: number }) =>
        createWalkIn(staff, { pitchId: "bogura-b", cellStarts: [cell(h)], phone: "01755556666", name: "Karim", cashReceived, discount });

    it("saves the original price, the discount and the reduced total; balance follows it", async () => {
        const q = await quoteWalkIn(staff, "bogura-b", [cell(12)]);
        const b = await walkIn(12, 500, { type: "FIXED", value: 300 });
        expect(b).toMatchObject({
            subtotal: q.subtotal, discountAmount: 300, total: q.total - 300, advancePaid: 500, balanceDue: q.total - 300 - 500,
            paymentStatus: "PARTIALLY_PAID",
        });
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        expect(saved).toMatchObject({ discountAmount: 300, discountType: "FIXED", discountValue: 300, total: q.total - 300, balanceAmount: q.total - 800 });
    });

    it("percent discount; collecting the balance takes only what is left of the discounted total", async () => {
        const q = await quoteWalkIn(staff, "bogura-b", [cell(15)]);
        const b = await walkIn(15, 0, { type: "PERCENT", value: 10 });
        const off = Math.round(q.subtotal * 0.1);
        expect(b).toMatchObject({ discountAmount: off, total: q.total - off, balanceDue: q.total - off });
        const after = await collectBalance(staff, b.code);
        expect(after).toMatchObject({ paymentStatus: "PAID", balanceDue: 0 });
        expect(after.payments).toEqual([expect.objectContaining({ kind: "BALANCE", amount: q.total - off })]);
    });

    it("cash above the discounted total is refused", async () => {
        const q = await quoteWalkIn(staff, "bogura-b", [cell(18)]);
        await expect(walkIn(18, q.total, { type: "FIXED", value: 100 })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    });

    it("a discount larger than the subtotal is refused (no negative total)", async () => {
        const q = await quoteWalkIn(staff, "bogura-b", [cell(18)]);
        await expect(walkIn(18, 0, { type: "FIXED", value: q.subtotal + 1 })).rejects.toMatchObject({ code: "INVALID_DISCOUNT" });
        expect(await BookingModel.countDocuments({ cellStarts: cell(18) })).toBe(0);
    });

    it("100% discount: a ৳0 booking, fully paid with no cash and no payment row", async () => {
        const b = await walkIn(21, 0, { type: "PERCENT", value: 100 });
        expect(b).toMatchObject({ total: 0, balanceDue: 0, paymentStatus: "PAID" });
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        expect(await PaymentModel.countDocuments({ bookingId: saved!.id })).toBe(0);
    });

    it("no discount: a walk-in is exactly as before", async () => {
        const q = await quoteWalkIn(staff, "bogura-a", [cell(12)]);
        const b = await createWalkIn(staff, { pitchId: "bogura-a", cellStarts: [cell(12)], phone: "01755556666", name: "Karim", cashReceived: q.total });
        expect(b).toMatchObject({ discountAmount: 0, total: q.total, paymentStatus: "PAID" });
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        expect(saved).toMatchObject({ discountAmount: 0, discountType: null, discountValue: null });
    });

    it("older bookings saved without discount fields read as no discount", async () => {
        const b = await walkIn(9, 0);
        await BookingModel.updateOne({ bookingCode: b.code }, { $unset: { discountAmount: "", discountType: "", discountValue: "" } });
        const { findBookingByCode, toDto } = await import("@/server/bookings");
        expect(toDto((await findBookingByCode(b.code))!).discountAmount).toBe(0);
    });

    it("receipt, CSV and confirmation email show the discount", async () => {
        const b = await walkIn(6, 1000, { type: "FIXED", value: 250 });
        expect(receiptHtml(b)).toContain("Discount");
        expect(receiptHtml(b)).toContain("-৳250");
        const csv = await bookingsCsv(admin, {});
        // "Additional charge" / "Charge reason" were appended after Discount (commit 1b122a8).
        expect(csv.split("\r\n")[0]).toMatch(/,"Discount","Additional charge","Charge reason"$/);
        expect(csv).toContain(`"${b.code}"`);
        const mail = bookingConfirmationTemplate({
            name: "Karim", code: b.code, pitchName: "Pitch B", sport: "Football", date: b.date, start: b.start, end: b.end,
            total: b.total, discount: 250, advance: 1000, balance: b.balanceDue,
        });
        expect(mail.text).toContain("Discount: −৳250");
        expect(mail.html).toContain("Discount");
    });
});
