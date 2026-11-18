// @vitest-environment happy-dom
// BookingsView (2026-11-17): arriving through another link while mounted adopts the new
// `initial` filters; local edits survive re-renders that keep the same `initial`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BookingListFilters } from "@/lib/bookingFilters";

const apiMock = vi.fn();
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: (...a: unknown[]) => apiMock(...a) }));

const { BookingsView } = await import("@/components/pages/admin/BookingsView");

const defaults: BookingListFilters = { from: "2026-11-11", to: "2026-12-18", bookingStatus: "", paymentStatus: "", requestOnly: false };
const view = (initial: BookingListFilters) => <BookingsView role="STAFF" initial={initial} defaults={defaults} />;
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const lastUrl = () => String(apiMock.mock.calls.at(-1)?.[0] ?? "");

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ bookings: [], next: null });
});
afterEach(cleanup);

describe("BookingsView filters from the URL", () => {
    it("starts from `initial`", async () => {
        render(view({ ...defaults, paymentStatus: "PARTIALLY_PAID" }));
        expect(value("From")).toBe("2026-11-11");
        expect(value("Payment status")).toBe("PARTIALLY_PAID");
        await waitFor(() => expect(lastUrl()).toContain("paymentStatus=PARTIALLY_PAID"));
    });

    it("adopts a new `initial` while mounted and clears search / source", async () => {
        const { rerender } = render(view(defaults));
        fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Karim" } });
        expect(value("Search")).toBe("Karim");

        const linked = { from: "2026-11-01", to: "2026-11-30", bookingStatus: "" as const, paymentStatus: "PARTIALLY_PAID" as const, requestOnly: true };
        rerender(view(linked));
        expect(value("From")).toBe("2026-11-01");
        expect(value("To")).toBe("2026-11-30");
        expect(value("Payment status")).toBe("PARTIALLY_PAID");
        expect(value("Search")).toBe("");
        await waitFor(() => expect(lastUrl()).toContain("request=open"));
        expect(lastUrl()).toContain("from=2026-11-01");
    });

    it("local edits win while `initial` stays the same (even as a new object)", () => {
        const { rerender } = render(view(defaults));
        fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
        rerender(view({ ...defaults }));
        expect(value("From")).toBe("2026-10-01");
    });
});
