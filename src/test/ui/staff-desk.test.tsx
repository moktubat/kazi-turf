// @vitest-environment happy-dom
// StaffDesk (2026-11-17): the Book / Manage mode follows ?manage=1 when the URL changes
// while the desk stays mounted, and the in-page toggle still works in between.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let query = new URLSearchParams();
vi.mock("next/navigation", () => ({
    useSearchParams: () => query,
    useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/admin",
}));
const apiMock = vi.fn();
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: (...a: unknown[]) => apiMock(...a) }));

const { StaffDesk } = await import("@/components/pages/admin/StaffDesk");

const BOARD = {
    branchId: "bogura", branchName: "Kazi", date: "2026-11-18", updatedAt: "2026-11-18T09:00:00.000Z",
    pitches: [{
        id: "p1", name: "Football", sport: "Football", format: "5 vs 5", maxConsecutiveSlots: 3,
        cells: [{ pitchId: "p1", cellStart: "2026-11-18T09:00:00.000Z", start: "15:00", end: "16:30", status: "AVAILABLE", price: 1900, originalPrice: 1900, hasDiscount: false, tier: "Peak" }],
    }],
    stats: { arrivalsPending: 0, checkedIn: 0, cashCollected: 0, totalSales: 0, advanceCollected: 0, pendingCash: 0, openRequests: 0 },
};

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (url: string) => (url.startsWith("/api/admin/board") ? BOARD : {}));
});
afterEach(cleanup);

const desk = () => <StaffDesk venue={{ id: "bogura", name: "Kazi" }} today="2026-11-18" maxDate="2026-12-18" role="STAFF" />;
const checked = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked");

describe("StaffDesk mode", () => {
    it("opens in Book mode by default and Manage with ?manage=1", async () => {
        query = new URLSearchParams();
        render(desk());
        await screen.findByRole("radio", { name: "Add walk-in booking" });
        expect(checked("Add walk-in booking")).toBe("true");
        cleanup();

        query = new URLSearchParams("manage=1");
        render(desk());
        await screen.findByRole("radio", { name: "Hold or maintenance" });
        expect(checked("Hold or maintenance")).toBe("true");
    });

    it("follows ?manage changes while mounted", async () => {
        query = new URLSearchParams();
        const { rerender } = render(desk());
        await screen.findByRole("radio", { name: "Add walk-in booking" });

        query = new URLSearchParams("manage=1");
        rerender(desk());
        expect(checked("Hold or maintenance")).toBe("true");

        query = new URLSearchParams();
        rerender(desk());
        expect(checked("Add walk-in booking")).toBe("true");
    });

    it("the in-page toggle wins until the URL actually changes", async () => {
        query = new URLSearchParams();
        const { rerender } = render(desk());
        await screen.findByRole("radio", { name: "Hold or maintenance" });
        fireEvent.click(screen.getByRole("radio", { name: "Hold or maintenance" }));
        expect(checked("Hold or maintenance")).toBe("true");

        rerender(desk()); // same URL: no reset
        expect(checked("Hold or maintenance")).toBe("true");
    });

    it("tapping an open slot in Book mode opens the walk-in form", async () => {
        query = new URLSearchParams();
        render(desk());
        const slot = await screen.findByRole("button", { name: /03:00 PM to 04:30 PM/ });
        fireEvent.click(slot);
        expect(await screen.findByRole("form", { name: "Walk-in booking" })).toBeTruthy();
    });
});
