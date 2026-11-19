// @vitest-environment happy-dom
// SetupView (2026-11-17): the open tab follows ?tab= when the sidebar links change it while
// the page stays mounted; disallowed tabs fall back; in-page taps update the URL.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SetupData, SetupTab } from "@/types/setup";

let query = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => query }));
// The tab bodies are tested elsewhere; stubs keep this test on SetupView's own logic.
vi.mock("@/components/pages/admin/setup/VenueTab", () => ({ VenueTab: () => <p>venue-body</p> }));
vi.mock("@/components/pages/admin/setup/PitchesTab", () => ({ PitchesTab: () => <p>pitches-body</p> }));
vi.mock("@/components/pages/admin/setup/RatesTab", () => ({ RatesTab: () => <p>rates-body</p> }));
vi.mock("@/components/pages/admin/setup/StaffTab", () => ({ StaffTab: () => <p>staff-body</p> }));
vi.mock("@/components/pages/admin/setup/PoliciesTab", () => ({ PoliciesTab: () => <p>policies-body</p> }));

const { SetupView } = await import("@/components/pages/admin/setup/SetupView");

const data = (tabs: SetupTab[]): SetupData => ({
    tabs, venue: { id: "bogura" } as SetupData["venue"], pitches: [], rates: [], adjustments: [], today: "2026-11-18",
    coverage: {}, staff: [], slotMinutes: 90, policies: {} as SetupData["policies"],
    defaultAdvance: { advancePercent: 30, nightAdvancePercent: 100 },
});
const ALL: SetupTab[] = ["venue", "pitches", "rates", "staff", "policies"];

beforeEach(() => {
    query = new URLSearchParams();
    window.history.replaceState(null, "", "/admin/setup");
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("SetupView tabs", () => {
    it("opens initialTab", () => {
        render(<SetupView data={data(ALL)} initialTab="rates" />);
        expect(screen.getByText("rates-body")).toBeTruthy();
    });

    it("follows ?tab= while mounted", () => {
        const { rerender } = render(<SetupView data={data(ALL)} initialTab="venue" />);
        expect(screen.getByText("venue-body")).toBeTruthy();

        query = new URLSearchParams("tab=staff");
        rerender(<SetupView data={data(ALL)} initialTab="staff" />);
        expect(screen.getByText("staff-body")).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Staff" }).getAttribute("aria-selected")).toBe("true");

        query = new URLSearchParams("tab=policies");
        rerender(<SetupView data={data(ALL)} initialTab="policies" />);
        expect(screen.getByText("policies-body")).toBeTruthy();
    });

    it("a ?tab= this user may not open falls back to the first allowed tab", () => {
        const staffTabs: SetupTab[] = ["pitches", "rates"];
        query = new URLSearchParams("tab=rates");
        const { rerender } = render(<SetupView data={data(staffTabs)} initialTab="rates" />);
        expect(screen.getByText("rates-body")).toBeTruthy();

        query = new URLSearchParams("tab=venue");
        rerender(<SetupView data={data(staffTabs)} initialTab="venue" />);
        expect(screen.getByText("pitches-body")).toBeTruthy();
        expect(screen.queryByRole("tab", { name: "Venue" })).toBeNull();
    });

    it("removing ?tab= goes back to the first tab", () => {
        query = new URLSearchParams("tab=rates");
        const { rerender } = render(<SetupView data={data(ALL)} initialTab="rates" />);
        query = new URLSearchParams();
        rerender(<SetupView data={data(ALL)} />);
        expect(screen.getByText("venue-body")).toBeTruthy();
    });

    it("a tap switches tab and writes ?tab= without being undone on re-render", () => {
        const { rerender } = render(<SetupView data={data(ALL)} initialTab="venue" />);
        fireEvent.click(screen.getByRole("tab", { name: "Fields" }));
        expect(screen.getByText("pitches-body")).toBeTruthy();
        expect(window.location.search).toBe("?tab=pitches");

        rerender(<SetupView data={data(ALL)} initialTab="venue" />); // URL hook unchanged
        expect(screen.getByText("pitches-body")).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: "Venue" }));
        expect(window.location.search).toBe("");
    });

    it("arrow keys move between tabs", () => {
        render(<SetupView data={data(ALL)} initialTab="venue" />);
        fireEvent.keyDown(screen.getByRole("tab", { name: "Venue" }), { key: "ArrowRight" });
        expect(screen.getByText("pitches-body")).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("tab", { name: "Fields" }), { key: "End" });
        expect(screen.getByText("policies-body")).toBeTruthy();
    });
});
