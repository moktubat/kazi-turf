// @vitest-environment happy-dom
// BookingPanel (2026-11-25): money actions (collect, discount, charge) come before check-in /
// override check-in; collect balance is offered on a checked-in booking; a balance still due
// is shown in red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AdminBookingDto } from "@/types/admin";

const apiMock = vi.fn();
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: (...a: unknown[]) => apiMock(...a) }));

const { BookingPanel } = await import("@/components/pages/admin/BookingPanel");

const can = (over: Partial<AdminBookingDto["can"]> = {}): AdminBookingDto["can"] => ({
    checkIn: false, overrideCheckIn: false, collectBalance: false, checkOut: false, undoCheckOut: false, cancel: false,
    refund: false, handleRequest: false, editDiscount: false, editCharge: false, editNote: false, undoCheckIn: false, ...over,
});

const booking = (over: Partial<AdminBookingDto>): AdminBookingDto =>
    ({
        code: "KT-SUU3LV", bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", source: "counter",
        customerName: "Jitu", phone: "01832679614", pitchName: "Football", sport: "Football",
        date: "2026-11-25", start: "19:30", end: "21:00", subtotal: 2700, discountAmount: 0, discountType: null, discountValue: null,
        additionalChargeAmount: 0, additionalChargeReason: null, vatRatePercent: null, vatAmount: 0, total: 2700,
        advancePaid: 500, balanceDue: 2200, note: null, cancelReason: null, changeRequest: null,
        checkIn: { state: "OUTSIDE_WINDOW", message: "Check-in opens at 7:15 PM.", opensAt: "" },
        payments: [{ id: "p1", provider: "CASH", kind: "ADVANCE", amount: 500, status: "SUCCESS", reference: null, at: "2026-11-23T13:02:00.000Z" }],
        can: can(),
        ...over,
    }) as AdminBookingDto;

const show = async (b: AdminBookingDto) => {
    apiMock.mockResolvedValue({ booking: b, audit: [] });
    render(<BookingPanel code={b.code} role="STAFF" onChanged={() => undefined} />);
    await screen.findByText("Balance due");
};
const buttonNames = () => screen.getAllByRole("button").map((x) => x.textContent?.trim() ?? "");
const indexOf = (names: string[], start: string) => names.findIndex((n) => n.startsWith(start));

beforeEach(() => apiMock.mockReset());
afterEach(cleanup);

describe("BookingPanel actions", () => {
    it("Booked: collect balance, add discount, add charge, then check in", async () => {
        await show(booking({ can: can({ checkIn: true, collectBalance: true, editDiscount: true, editCharge: true, editNote: true, checkOut: true }) }));
        const names = buttonNames();
        const order = ["Collect balance", "Add discount", "Add charge", "Check in", "Check out", "Add note"].map((s) => indexOf(names, s));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("Checked in with a balance: collect balance is offered, override check-in sits under add charge", async () => {
        await show(
            booking({
                bookingStatus: "CHECKED_IN",
                checkIn: { state: "BLOCKED", message: "Already checked in at 9:21 PM.", opensAt: "" },
                can: can({ overrideCheckIn: true, collectBalance: true, editDiscount: true, editCharge: true, editNote: true, checkOut: true, undoCheckIn: true }),
            })
        );
        const names = buttonNames();
        expect(indexOf(names, "Collect balance (cash ৳2,200)")).toBeGreaterThanOrEqual(0);
        expect(indexOf(names, "Add charge")).toBeLessThan(indexOf(names, "Override check-in"));
        expect(indexOf(names, "Override check-in")).toBeLessThan(indexOf(names, "Check out"));
    });
});

describe("Balance due colour", () => {
    it("is red while money is owed", async () => {
        await show(booking({}));
        expect(screen.getByText("Balance due").parentElement?.className).toContain("text-booked");
    });

    it("is not red once fully paid", async () => {
        await show(booking({ paymentStatus: "PAID", balanceDue: 0 }));
        expect(screen.getByText("Balance due").parentElement?.className).not.toContain("text-booked");
    });
});

describe("after undo check-out with the balance reversed", () => {
    it("Booked · Due: the reversed payment is listed but not counted; undo label names Booked", async () => {
        await show(
            booking({
                checkedInAt: null,
                payments: [
                    { id: "p1", provider: "CASH", kind: "ADVANCE", amount: 1000, status: "SUCCESS", reference: null, at: "2026-11-25T06:33:00.000Z" },
                    { id: "p2", provider: "CASH", kind: "BALANCE", amount: 900, status: "VOIDED", reference: null, at: "2026-11-25T06:34:00.000Z" },
                ],
                total: 1900, balanceDue: 900, advancePaid: 1000,
                can: can({ collectBalance: true }),
            })
        );
        expect(screen.getByText(/Reversed \(not received\)/)).toBeTruthy();
        expect(screen.getByText("Paid so far").nextElementSibling?.textContent).toBe("৳1,000");
        expect(screen.getByText("Balance due").parentElement?.className).toContain("text-booked");
        expect(screen.getByRole("button", { name: /Collect balance \(cash ৳900\)/ })).toBeTruthy();
    });

    it("a checked-out booking that was never checked in says undo goes back to Booked", async () => {
        await show(booking({ bookingStatus: "COMPLETED", paymentStatus: "PAID", balanceDue: 0, checkedInAt: null, can: can({ undoCheckOut: true }) }));
        expect(screen.getByRole("button", { name: /Undo check-out \(back to Booked\)/ })).toBeTruthy();
    });
});

describe("Checked in · Due", () => {
    const checkedIn = (over: Partial<AdminBookingDto>) =>
        booking({
            bookingStatus: "CHECKED_IN",
            checkedInAt: "2026-11-24T15:21:00.000Z",
            checkIn: { state: "BLOCKED", message: "Already checked in at 9:21 PM.", opensAt: "" },
            can: can({ collectBalance: true, editDiscount: true, editCharge: true, checkOut: true, undoCheckIn: true }),
            ...over,
        });

    it("checked in without paying: red Due badge, a clear notice, and Collect balance", async () => {
        await show(checkedIn({ balanceDue: 1700 }));
        expect(screen.getByText("Due ৳1,700")).toBeTruthy();
        const notice = screen.getByText(/The balance is not paid yet/);
        expect(notice.textContent).toContain("Checked in at 9:21 PM · Due ৳1,700");
        expect(notice.className).toContain("text-booked");
        expect(screen.queryByText("Already checked in at 9:21 PM.")).toBeNull();
        expect(screen.getByRole("button", { name: /Collect balance \(cash ৳1,700\)/ })).toBeTruthy();
    });

    it("checked in and fully paid: no Due badge, the usual check-in line", async () => {
        await show(checkedIn({ paymentStatus: "PAID", balanceDue: 0, can: can({ checkOut: true }) }));
        expect(screen.queryByText(/^Due ৳/)).toBeNull();
        expect(screen.getByText("Already checked in at 9:21 PM.")).toBeTruthy();
    });
});
