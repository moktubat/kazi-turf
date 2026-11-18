// @vitest-environment happy-dom
// Walk-in form: the new Note field with Paid / Unpaid quick picks, and that it is sent
// with the booking.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BoardPitch } from "@/types/admin";

const apiMock = vi.fn();
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: (...a: unknown[]) => apiMock(...a) }));
vi.mock("@/lib/printReceipt", () => ({ printReceipt: vi.fn() }));

const { WalkInForm } = await import("@/components/pages/admin/WalkInForm");

const QUOTE = { subtotal: 1900, originalSubtotal: 1900, vat: 0, vatRatePercent: null, total: 1900, advance: 570, advancePercent: 30 };
const cell = (h: number) => ({
    pitchId: "p1", cellStart: `2026-11-18T${String(h).padStart(2, "0")}:00:00.000Z`, start: `${h}:00`, end: `${h}:00`,
    status: "AVAILABLE" as const, price: 1900, originalPrice: 1900, hasDiscount: false, tier: "Peak",
});
const pitch: BoardPitch = {
    id: "p1", name: "Football", sport: "Football", format: "5 vs 5", maxConsecutiveSlots: 4,
    cells: [{ ...cell(9), start: "15:00", end: "16:30" }, { ...cell(10), start: "16:30", end: "18:00" }],
};

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === "/api/admin/quote") return { quote: QUOTE };
        if (url.startsWith("/api/admin/customers")) return { customer: null };
        if (url === "/api/admin/bookings") {
            const body = JSON.parse(String(init?.body));
            return {
                booking: {
                    code: "KZ-1234", customerName: body.name, date: "2026-11-18", start: "15:00", end: "16:30",
                    total: 1900, advancePaid: body.cashReceived, balanceDue: 1900 - body.cashReceived, note: body.note ?? null,
                },
            };
        }
        throw new Error(`unexpected ${url}`);
    });
});
afterEach(cleanup);

const renderForm = () =>
    render(<WalkInForm pitch={pitch} cellStart={pitch.cells[0].cellStart} date="2026-11-18" onCreated={vi.fn()} onClose={vi.fn()} />);

describe("WalkInForm note", () => {
    it("shows an optional note field with Paid / Unpaid quick picks", async () => {
        renderForm();
        await screen.findByText("Full ৳1,900");
        expect(screen.getByLabelText("Note (optional)")).toBeTruthy();
        const group = screen.getByRole("group", { name: "Quick pick note" });
        expect(group.textContent).toContain("Paid");
        expect(group.textContent).toContain("Unpaid");
    });

    it("quick picks fill the note, toggle off, and Paid/Unpaid swap", async () => {
        renderForm();
        await screen.findByText("Full ৳1,900");
        const note = screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
        const paid = screen.getByRole("button", { name: "Paid" });
        const unpaid = screen.getByRole("button", { name: "Unpaid" });

        fireEvent.click(paid);
        expect(note.value).toBe("Paid");
        expect(paid.getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(unpaid);
        expect(note.value).toBe("Unpaid");
        expect(paid.getAttribute("aria-pressed")).toBe("false");
        expect(unpaid.getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(unpaid);
        expect(note.value).toBe("");
    });

    it("typed text stays when a pick is added", async () => {
        renderForm();
        await screen.findByText("Full ৳1,900");
        const note = screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
        fireEvent.change(note, { target: { value: "Team Falcons" } });
        fireEvent.click(screen.getByRole("button", { name: "Balance at check-in" }));
        expect(note.value).toBe("Team Falcons · Balance at check-in");
    });

    it("sends the note with the booking and shows it on the confirmation", async () => {
        renderForm();
        await screen.findByText("Full ৳1,900");
        fireEvent.change(screen.getByLabelText("Customer phone"), { target: { value: "01733334444" } });
        fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Karim" } });
        fireEvent.click(screen.getByRole("button", { name: "Advance ৳570" }));
        fireEvent.click(screen.getByRole("button", { name: "Unpaid" }));
        fireEvent.click(screen.getByRole("button", { name: "Create booking" }));

        await screen.findByText("Walk-in booked");
        const call = apiMock.mock.calls.find(([u]) => u === "/api/admin/bookings")!;
        expect(JSON.parse(call[1].body)).toMatchObject({ cashReceived: 570, note: "Unpaid", name: "Karim" });
        expect(screen.getByText("Unpaid")).toBeTruthy();
    });

    it("omits an empty note from the request", async () => {
        renderForm();
        await screen.findByText("Full ৳1,900");
        fireEvent.change(screen.getByLabelText("Customer phone"), { target: { value: "01733334444" } });
        fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Karim" } });
        fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "   " } });
        fireEvent.click(screen.getByRole("button", { name: "Create booking" }));
        await waitFor(() => expect(apiMock.mock.calls.some(([u]) => u === "/api/admin/bookings")).toBe(true));
        const call = apiMock.mock.calls.find(([u]) => u === "/api/admin/bookings")!;
        expect(JSON.parse(call[1].body)).not.toHaveProperty("note");
    });
});
