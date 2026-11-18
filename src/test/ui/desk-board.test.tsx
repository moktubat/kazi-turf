// @vitest-environment happy-dom
// DeskBoard (2026-11-17): passed hours hidden, wrap layout, a plain tap (no long press / ⋯
// button) routed by mode, and the updated walk-in hint.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DeskBoard } from "@/components/pages/admin/DeskBoard";
import type { BoardCell, BoardPitch } from "@/types/admin";

afterEach(cleanup);

const c = (h: number, status: BoardCell["status"], extra: Partial<BoardCell> = {}): BoardCell => ({
    pitchId: "p1", cellStart: `2026-11-18T${String(h).padStart(2, "0")}:00:00.000Z`,
    start: `${String(h).padStart(2, "0")}:00`, end: `${String(h + 1).padStart(2, "0")}:00`,
    status, price: 1500, originalPrice: 1500, hasDiscount: false, tier: "Peak", ...extra,
});
const pitch = (cells: BoardCell[], id = "p1", name = "Football"): BoardPitch => ({
    id, name, sport: "Football", format: "5 vs 5", maxConsecutiveSlots: 3, cells,
});

function setup(pitches: BoardPitch[], mode: "book" | "manage" = "book") {
    const props = { onModeChange: vi.fn(), onAvailable: vi.fn(), onBooking: vi.fn(), onBlock: vi.fn() };
    const r = render(<DeskBoard pitches={pitches} mode={mode} {...props} />);
    return { ...props, ...r };
}

const slotButtons = () => screen.queryAllByRole("button").filter((b) => /\bto\b/.test(b.getAttribute("aria-label") ?? ""));

describe("DeskBoard", () => {
    it("hides passed hours but keeps earlier bookings", () => {
        setup([pitch([
            c(8, "PAST"),
            c(9, "BOOKED", { booking: { code: "KZ1", customerName: "Rahim", bookingStatus: "CONFIRMED", paymentStatus: "PAID", balanceDue: 0 } }),
            c(10, "AVAILABLE"),
        ])]);
        const labels = slotButtons().map((b) => b.getAttribute("aria-label"));
        expect(labels).toHaveLength(2);
        expect(labels.some((l) => l!.includes("8:00 AM"))).toBe(false);
        expect(labels.some((l) => l!.includes("Rahim"))).toBe(true);
    });

    it("says so when every slot has passed", () => {
        setup([pitch([c(8, "PAST"), c(9, "PAST")])]);
        expect(screen.getByText("No slots left to show for this day.")).toBeTruthy();
        expect(slotButtons()).toHaveLength(0);
    });

    it("lays slots out in a wrapping row with content-width cards", () => {
        setup([pitch([c(10, "AVAILABLE"), c(11, "AVAILABLE")])]);
        const [first] = slotButtons();
        expect(first.className).toContain("w-fit");
        expect(first.parentElement!.className).toContain("flex-wrap");
        expect(first.parentElement!.className).not.toContain("overflow-x-auto");
    });

    it("has no long-press / ⋯ hold button on open slots any more", () => {
        setup([pitch([c(10, "AVAILABLE")])]);
        expect(screen.queryByRole("button", { name: /^Hold or block/ })).toBeNull();
    });

    it("book mode: a tap on an open slot starts a walk-in", () => {
        const p = pitch([c(10, "AVAILABLE")]);
        const { onAvailable, onBlock } = setup([p]);
        fireEvent.click(slotButtons()[0]);
        expect(onAvailable).toHaveBeenCalledWith("p1", p.cells[0]);
        expect(onBlock).not.toHaveBeenCalled();
    });

    it("manage mode: a tap on an open slot opens hold / maintenance", () => {
        const p = pitch([c(10, "AVAILABLE")]);
        const { onAvailable, onBlock } = setup([p], "manage");
        fireEvent.click(slotButtons()[0]);
        expect(onBlock).toHaveBeenCalledWith("p1", p.cells[0]);
        expect(onAvailable).not.toHaveBeenCalled();
    });

    it("a booking opens the booking; a staff hold opens the block panel", () => {
        const { onBooking, onBlock } = setup([pitch([
            c(10, "BOOKED", { booking: { code: "KZ9", customerName: "Karim", bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", balanceDue: 500 } }),
            c(11, "HELD", { reason: "Team practice" }),
        ])], "manage");
        const [booked, held] = slotButtons();
        fireEvent.click(booked);
        expect(onBooking).toHaveBeenCalledWith("KZ9");
        fireEvent.click(held);
        expect(onBlock).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Due ৳500")).toBeTruthy();
    });

    it("the walk-in hint points to Hold or maintenance", () => {
        setup([pitch([c(10, "AVAILABLE")])]);
        expect(screen.getByText(/To hold or block a slot instead, switch to Hold or maintenance\./)).toBeTruthy();
    });

    it("switching the field tab shows that field's slots", () => {
        setup([pitch([c(10, "AVAILABLE")], "p1", "Football"), pitch([c(14, "AVAILABLE"), c(15, "AVAILABLE")], "p2", "Cricket")]);
        expect(slotButtons()).toHaveLength(1);
        fireEvent.click(screen.getByRole("tab", { name: /Cricket/ }));
        expect(slotButtons()).toHaveLength(2);
    });
});
