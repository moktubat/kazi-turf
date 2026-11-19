// @vitest-environment happy-dom
// Walk-in form: optional discount (taka or percent) shows the original price, the discount
// and the payable amount; cash, quick picks and the request follow the discounted total;
// an invalid discount blocks the booking.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BoardPitch } from "@/types/admin";

const apiMock = vi.fn();
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: (...a: unknown[]) => apiMock(...a) }));
vi.mock("@/lib/printReceipt", () => ({ printReceipt: vi.fn() }));

const { WalkInForm } = await import("@/components/pages/admin/WalkInForm");

let QUOTE = { subtotal: 2000, originalSubtotal: 2000, vat: 0, vatRatePercent: null, vatMode: "exclusive", total: 2000, advance: 600, advancePercent: 30 };
const cell = (h: number) => ({
    pitchId: "p1", cellStart: `2026-11-18T${String(h).padStart(2, "0")}:00:00.000Z`, start: "15:00", end: "16:30",
    status: "AVAILABLE" as const, price: 2000, originalPrice: 2000, hasDiscount: false, tier: "Peak",
});
const pitch: BoardPitch = { id: "p1", name: "Football", sport: "Football", format: "5 vs 5", maxConsecutiveSlots: 1, cells: [cell(9)] };

beforeEach(() => {
    QUOTE = { subtotal: 2000, originalSubtotal: 2000, vat: 0, vatRatePercent: null, vatMode: "exclusive", total: 2000, advance: 600, advancePercent: 30 };
    apiMock.mockReset();
    apiMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/admin/quote") return { quote: QUOTE };
        if (url.startsWith("/api/admin/customers")) return { customer: null };
        if (url === "/api/admin/bookings") {
            const body = JSON.parse(String(init?.body));
            const off = body.discount ? (body.discount.type === "PERCENT" ? 2000 * body.discount.value / 100 : body.discount.value) : 0;
            return {
                booking: {
                    code: "KT-ABCDEF", customerName: body.name, date: "2026-11-18", start: "15:00", end: "16:30",
                    total: 2000 - off, discountAmount: off, advancePaid: body.cashReceived, balanceDue: 2000 - off - body.cashReceived, note: null,
                },
            };
        }
        throw new Error(`unexpected ${url}`);
    });
});
afterEach(cleanup);

const renderForm = () =>
    render(<WalkInForm pitch={pitch} cellStart={pitch.cells[0].cellStart} date="2026-11-18" onCreated={vi.fn()} onClose={vi.fn()} />);
const fillCustomer = () => {
    fireEvent.change(screen.getByLabelText("Customer phone"), { target: { value: "01733334444" } });
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Karim" } });
};
const bookingCall = () => apiMock.mock.calls.find(([u]) => u === "/api/admin/bookings");
const row = (label: string) => screen.getByText(label).closest("div")!.textContent;

describe("WalkInForm discount", () => {
    it("without a discount the form is unchanged", async () => {
        renderForm();
        await screen.findByText("Full ৳2,000");
        expect(screen.getByLabelText("Discount (optional)")).toBeTruthy();
        expect(row("Total")).toContain("৳2,000");
        expect(screen.queryByText("Payable")).toBeNull();
    });

    it("a taka discount shows original price, discount and payable; cash follows the payable", async () => {
        renderForm();
        await screen.findByText("Full ৳2,000");
        fireEvent.change(screen.getByLabelText("Discount (optional)"), { target: { value: "300" } });
        expect(row("Original price")).toContain("৳2,000");
        expect(row("Discount")).toContain("−৳300");
        expect(row("Payable")).toContain("৳1,700");
        expect((screen.getByLabelText("Cash received (৳)") as HTMLInputElement).value).toBe("1700");
        expect(screen.getByRole("button", { name: "Full ৳1,700" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Advance ৳510" })).toBeTruthy(); // 30% of the payable

        fillCustomer();
        fireEvent.click(screen.getByRole("button", { name: "Advance ৳510" }));
        fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
        await screen.findByText("Walk-in booked");
        expect(JSON.parse(bookingCall()![1].body)).toMatchObject({ cashReceived: 510, discount: { type: "FIXED", value: 300 } });
        expect(screen.getByText("Discount").closest("div")!.textContent).toContain("−৳300");
    });

    it("a percent discount", async () => {
        renderForm();
        await screen.findByText("Full ৳2,000");
        fireEvent.change(screen.getByLabelText("Discount type"), { target: { value: "PERCENT" } });
        fireEvent.change(screen.getByLabelText("Discount (optional)"), { target: { value: "10" } });
        expect(row("Discount (10%)")).toContain("−৳200");
        expect(row("Payable")).toContain("৳1,800");
        fillCustomer();
        fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
        await waitFor(() => expect(bookingCall()).toBeTruthy());
        expect(JSON.parse(bookingCall()![1].body)).toMatchObject({ cashReceived: 1800, discount: { type: "PERCENT", value: 10 } });
    });

    it("an invalid discount is shown and blocks the booking", async () => {
        renderForm();
        await screen.findByText("Full ৳2,000");
        fillCustomer();
        fireEvent.change(screen.getByLabelText("Discount (optional)"), { target: { value: "2500" } });
        expect(screen.getByText("At most ৳2,000 (the subtotal)")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
        expect(bookingCall()).toBeUndefined();

        fireEvent.change(screen.getByLabelText("Discount type"), { target: { value: "PERCENT" } });
        fireEvent.change(screen.getByLabelText("Discount (optional)"), { target: { value: "150" } });
        expect(screen.getByText("At most 100%")).toBeTruthy();
    });

    it("cash above the discounted total is refused", async () => {
        renderForm();
        await screen.findByText("Full ৳2,000");
        fillCustomer();
        fireEvent.change(screen.getByLabelText("Discount (optional)"), { target: { value: "500" } });
        fireEvent.change(screen.getByLabelText("Cash received (৳)"), { target: { value: "2000" } });
        fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
        expect(await screen.findByText("Between ৳0 and ৳1,500")).toBeTruthy();
        expect(bookingCall()).toBeUndefined();
    });

    it("a 0% sport: no advance pick and a clear hint", async () => {
        QUOTE = { ...QUOTE, advance: 0, advancePercent: 0 };
        renderForm();
        await screen.findByText("Full ৳2,000");
        expect(screen.queryByRole("button", { name: /^Advance/ })).toBeNull();
        expect(screen.getByText(/This sport needs no advance\./)).toBeTruthy();
    });
});
