// @vitest-environment happy-dom
// SlotTable (2026-11-18): teal headings, bottom row rounded so its selection ring keeps
// its corners; plus selection, keyboard, past-slot and pitch-tab behaviour.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlotTable } from "@/components/pages/booking/SlotTable";
import type { Cell } from "@/server/availability";
import type { PitchAvailability } from "@/types/booking";

afterEach(cleanup);

// Slots far in the future so the "already started" filter never hides them.
const iso = (h: number) => `2099-01-01T${String(h).padStart(2, "0")}:00:00.000Z`;
const cell = (h: number, status: Cell["status"] = "AVAILABLE", over: Partial<Cell> = {}): Cell => ({
    pitchId: "p1", cellStart: iso(h), start: `${String(h).padStart(2, "0")}:00`, end: `${String(h + 1).padStart(2, "0")}:00`,
    status, price: 1500, originalPrice: 1500, hasDiscount: false, tier: "Peak", ...over,
});
const pitch = (id: string, name: string, cells: Cell[]): PitchAvailability => ({
    id, name, sport: "Football", format: "5 vs 5", maxConsecutiveSlots: 2, cells: cells.map((c) => ({ ...c, pitchId: id })),
});

const rows = () => screen.queryAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));

describe("SlotTable", () => {
    it("column headings use the teal colour", () => {
        render(<SlotTable pitches={[pitch("p1", "Pitch A", [cell(10)])]} selectedPitchId={null} selected={[]} onToggle={vi.fn()} />);
        for (const h of ["Time Slot", "Price", "Status", "Action"]) {
            const el = screen.getByText(h);
            expect(el.className).toContain("text-teal");
            expect(el.className).not.toContain("text-emerald");
        }
    });

    it("every row (available or not) rounds its bottom corners when it is last", () => {
        render(<SlotTable pitches={[pitch("p1", "Pitch A", [cell(10), cell(11, "BOOKED")])]} selectedPitchId={null} selected={[]} onToggle={vi.fn()} />);
        const [available] = rows();
        expect(available.className).toContain("last:rounded-b-2xl");
        const booked = screen.getAllByText("Booked").find((e) => e.closest("[class*='grid-cols']") && !e.closest("ul"))!;
        expect(booked.closest("[class*='grid-cols']")!.className).toContain("last:rounded-b-2xl");
    });

    it("tapping or pressing Enter / Space on an open slot toggles it", () => {
        const onToggle = vi.fn();
        const p = pitch("p1", "Pitch A", [cell(10)]);
        render(<SlotTable pitches={[p]} selectedPitchId={null} selected={[]} onToggle={onToggle} />);
        const [row] = rows();
        fireEvent.click(row);
        fireEvent.keyDown(row, { key: "Enter" });
        fireEvent.keyDown(row, { key: " " });
        fireEvent.keyDown(row, { key: "a" });
        expect(onToggle).toHaveBeenCalledTimes(3);
        expect(onToggle).toHaveBeenCalledWith("p1", p.cells[0]);
    });

    it("unavailable slots are not buttons", () => {
        render(<SlotTable pitches={[pitch("p1", "Pitch A", [cell(10, "BOOKED"), cell(11, "MAINTENANCE")])]} selectedPitchId={null} selected={[]} onToggle={vi.fn()} />);
        expect(rows()).toHaveLength(0);
    });

    it("a selected slot shows the ring and Selected", () => {
        render(<SlotTable pitches={[pitch("p1", "Pitch A", [cell(10)])]} selectedPitchId="p1" selected={[iso(10)]} onToggle={vi.fn()} />);
        const [row] = rows();
        expect(row.getAttribute("aria-pressed")).toBe("true");
        expect(row.className).toContain("ring-teal");
    });

    it("discounted price is announced", () => {
        render(<SlotTable pitches={[pitch("p1", "Pitch A", [cell(10, "AVAILABLE", { hasDiscount: true, originalPrice: 2000, price: 1500 })])]} selectedPitchId={null} selected={[]} onToggle={vi.fn()} />);
        expect(rows()[0].getAttribute("aria-label")).toMatch(/৳2,000 discounted to ৳1,500/);
    });

    it("past slots are dropped, and a fully past day shows the empty message", () => {
        render(<SlotTable pitches={[pitch("p1", "Pitch A", [cell(9, "PAST"), cell(10)])]} selectedPitchId={null} selected={[]} onToggle={vi.fn()} />);
        expect(rows()).toHaveLength(1);
        cleanup();
        render(<SlotTable pitches={[pitch("p1", "Pitch A", [cell(9, "PAST")])]} selectedPitchId={null} selected={[]} onToggle={vi.fn()} />);
        expect(screen.getByText("All slots for today have already started.")).toBeTruthy();
    });

    it("with tabs, the shown pitch follows selectedPitchId changes", () => {
        const ps = [pitch("p1", "Pitch A", [cell(10)]), pitch("p2", "Pitch B", [cell(12), cell(13)])];
        const { rerender } = render(<SlotTable pitches={ps} selectedPitchId={null} selected={[]} onToggle={vi.fn()} showTabs />);
        expect(rows()).toHaveLength(1);
        rerender(<SlotTable pitches={ps} selectedPitchId="p2" selected={[]} onToggle={vi.fn()} showTabs />);
        expect(rows()).toHaveLength(2);
        fireEvent.click(screen.getByRole("tab", { name: "Pitch A" }));
        expect(rows()).toHaveLength(1);
    });
});
