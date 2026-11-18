// @vitest-environment happy-dom
// FilterBar (2026-11-18): wider date column on desktop; sport / pitch / date / refresh wiring.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilterBar, type FlowVenue } from "@/components/pages/booking/FilterBar";

afterEach(cleanup);

const venue = (sports: string[]): FlowVenue => ({ id: "bogura", name: "Kazi", address: "", mapUrl: "", sports });

function setup(over: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
    const props = {
        venue: venue(["Football", "Cricket"]), sport: "Football",
        pitches: [{ id: "p1", name: "Pitch A", format: "7-a-side" }, { id: "p2", name: "Pitch B", format: "" }],
        pitchFilter: "", date: "2026-11-18", minDate: "2026-11-18", maxDate: "2026-12-18", refreshing: false,
        onSport: vi.fn(), onPitch: vi.fn(), onDate: vi.fn(), onRefresh: vi.fn(), ...over,
    };
    render(<FilterBar {...props} />);
    return props;
}

describe("FilterBar", () => {
    it("desktop grid: sport and pitch narrower, date + refresh wider", () => {
        setup();
        const grid = screen.getByRole("region", { name: "Select sport" }).parentElement!;
        expect(grid.className).toContain("lg:grid-cols-[1fr_1fr_1.4fr]");
        expect(grid.className).not.toContain("lg:grid-cols-3");
    });

    it("one sport shows as text, several as a select that reports changes", () => {
        const p = setup();
        fireEvent.change(screen.getByRole("combobox", { name: "Select sport" }), { target: { value: "Cricket" } });
        expect(p.onSport).toHaveBeenCalledWith("Cricket");
        cleanup();

        setup({ venue: venue(["Football"]) });
        expect(screen.queryByRole("combobox", { name: "Select sport" })).toBeNull();
        expect(screen.getByText("Football")).toBeTruthy();
    });

    it("pitch select lists All pitches plus each pitch with its format", () => {
        const p = setup();
        const select = screen.getByRole("combobox", { name: "Select pitch" }) as HTMLSelectElement;
        expect([...select.options].map((o) => o.textContent)).toEqual(["All pitches", "Pitch A · 7-a-side", "Pitch B"]);
        fireEvent.change(select, { target: { value: "p2" } });
        expect(p.onPitch).toHaveBeenCalledWith("p2");
    });

    it("pitch select shows loading / empty states", () => {
        setup({ pitches: undefined });
        expect(screen.getByText("Loading pitches…")).toBeTruthy();
        cleanup();
        setup({ pitches: [] });
        expect(screen.getByText("No pitches")).toBeTruthy();
    });

    it("date input keeps the booking window and ignores a cleared value", () => {
        const p = setup();
        const input = screen.getByLabelText("Pick a date") as HTMLInputElement;
        expect(input.min).toBe("2026-11-18");
        expect(input.max).toBe("2026-12-18");
        fireEvent.change(input, { target: { value: "2026-11-20" } });
        expect(p.onDate).toHaveBeenCalledWith("2026-11-20");
        fireEvent.change(input, { target: { value: "" } });
        expect(p.onDate).toHaveBeenCalledTimes(1);
    });

    it("refresh calls back and is disabled while refreshing", () => {
        const p = setup();
        fireEvent.click(screen.getByRole("button", { name: "Refresh availability" }));
        expect(p.onRefresh).toHaveBeenCalled();
        cleanup();
        setup({ refreshing: true });
        expect((screen.getByRole("button", { name: "Refresh availability" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows the booking window in days", () => {
        setup();
        expect(screen.getByText("Booking window: 30 days ahead.")).toBeTruthy();
        cleanup();
        setup({ maxDate: "2026-11-19" });
        expect(screen.getByText("Booking window: 1 day ahead.")).toBeTruthy();
    });
});
