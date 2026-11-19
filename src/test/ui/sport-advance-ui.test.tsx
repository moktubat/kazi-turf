// @vitest-environment happy-dom
// Setup → Venue: every sport has its own day / night advance (0–100%), prefilled with what it
// uses today, validated before saving and sent with the sport. Booking summary: a 0% sport
// shows "No advance"; another sport shows its own percentage. Policies no longer edits it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Branch } from "@/types";
import type { PolicyForm } from "@/types/setup";

const apiMock = vi.fn();
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: (...a: unknown[]) => apiMock(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { VenueTab } = await import("@/components/pages/admin/setup/VenueTab");
const { PoliciesTab } = await import("@/components/pages/admin/setup/PoliciesTab");
const { SummaryCard } = await import("@/components/pages/booking/SummaryCard");

const venue: Branch = {
    id: "bogura", name: "Kazi Sports Arena", slug: "kazi", address: "Shabgram, Bogura", phone: "+8801354490362",
    whatsapp: "8801354490362", mapUrl: "https://maps.app.goo.gl/x", hours: "24 hours", status: "ACTIVE",
    sports: ["Football", "Badminton"],
    sportConfigs: [
        { id: "football", name: "Football", image: "", active: true, advancePercent: 50, nightAdvancePercent: 100 },
        { id: "badminton", name: "Badminton", image: "", active: true, advancePercent: 30, nightAdvancePercent: 30 },
    ],
};
const DEFAULTS = { advancePercent: 30, nightAdvancePercent: 100 };

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ saved: true });
});
afterEach(cleanup);

const dayInputs = () => screen.getAllByLabelText("Day (%) · 6 AM–12 AM") as HTMLInputElement[];
const nightInputs = () => screen.getAllByLabelText("Night (%) · 12 AM–6 AM") as HTMLInputElement[];
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
const sentBody = () => JSON.parse(apiMock.mock.calls.find(([u]) => u === "/admin/setup/branches")![1].body);

describe("Venue tab: sport-wise advance", () => {
    it("each sport shows its own day and night advance", () => {
        render(<VenueTab venue={venue} defaultAdvance={DEFAULTS} />);
        expect(dayInputs().map((i) => i.value)).toEqual(["50", "30"]);
        expect(nightInputs().map((i) => i.value)).toEqual(["100", "30"]);
        expect(dayInputs()[0].min).toBe("0");
        expect(dayInputs()[0].max).toBe("100");
    });

    it("a new sport starts from the venue-wide default", () => {
        render(<VenueTab venue={venue} defaultAdvance={DEFAULTS} />);
        fireEvent.click(screen.getByRole("button", { name: "Add sport" }));
        expect(dayInputs()[2].value).toBe("30");
        expect(nightInputs()[2].value).toBe("100");
    });

    it.each(["0", "20", "100"])("saves %s%% and marks the sport as changed", async (pct) => {
        render(<VenueTab venue={venue} defaultAdvance={DEFAULTS} />);
        fireEvent.change(dayInputs()[1], { target: { value: pct } });
        save();
        await waitFor(() => expect(apiMock).toHaveBeenCalled());
        const body = sentBody();
        expect(body.sportConfigs[1]).toMatchObject({ name: "Badminton", advancePercent: Number(pct), nightAdvancePercent: 30 });
        expect(body.sportConfigs[0]).toMatchObject({ name: "Football", advancePercent: 50, nightAdvancePercent: 100 });
        expect(body.touchedSportIds).toEqual(["badminton"]);
    });

    it.each(["", "101", "-5", "12.5"])("refuses %j before saving", (bad) => {
        render(<VenueTab venue={venue} defaultAdvance={DEFAULTS} />);
        fireEvent.change(nightInputs()[0], { target: { value: bad } });
        save();
        expect(screen.getByText("Enter a whole number from 0 to 100")).toBeTruthy();
        expect(apiMock).not.toHaveBeenCalled();
    });
});

describe("Policies tab", () => {
    const policies: PolicyForm = {
        holdMinutes: 10, advancePercent: 30, nightAdvancePercent: 100, checkInOpensMinutesBefore: 30, bookingHorizonDays: 14,
        vatRatePercent: null, vatMode: "exclusive", vatRegistrationNo: "",
        refund: { tiers: [], method: "", timing: "", exceptions: [] }, legalReviewed: false,
    };

    it("no longer edits the advance and points to the sports instead", async () => {
        render(<PoliciesTab policies={policies} />);
        expect(screen.queryByLabelText(/Advance payment/)).toBeNull();
        expect(screen.getByText(/is now set for each sport/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Save/ }));
        await waitFor(() => expect(apiMock).toHaveBeenCalled());
        const body = JSON.parse(apiMock.mock.calls[0][1].body);
        expect(body).not.toHaveProperty("advancePercent");
        expect(body).not.toHaveProperty("nightAdvancePercent");
    });
});

describe("Booking summary", () => {
    const info = { pitchName: "Court 1", sport: "Table Tennis", date: "2026-11-20", start: "18:00", end: "19:30", slotCount: 1, minutes: 90 };

    it("a 0% sport shows no advance and the whole price at the venue", () => {
        render(<SummaryCard info={info} loading={false} advancePercent={0}
            amounts={{ subtotal: 1500, originalSubtotal: 1500, vat: 0, vatRate: null, total: 1500, advance: 0, balance: 1500 }} />);
        const box = within(screen.getByRole("region", { name: "Booking summary" }));
        expect(box.getByText("No advance")).toBeTruthy();
        expect(box.getByText("Payable at venue").parentElement!.textContent).toContain("৳1,500");
        expect(box.queryByText(/%\)/)).toBeNull();
    });

    it("another sport shows its own percentage and amounts", () => {
        render(<SummaryCard info={{ ...info, sport: "Football" }} loading={false} advancePercent={50}
            amounts={{ subtotal: 3000, originalSubtotal: 3000, vat: 0, vatRate: null, total: 3000, advance: 1500, balance: 1500 }} />);
        expect(screen.getByText("Advance due now (50%)").parentElement!.textContent).toContain("৳1,500");
        expect(screen.getByText("Balance payable at venue").parentElement!.textContent).toContain("৳1,500");
    });

    it("100%: nothing left at the venue", () => {
        render(<SummaryCard info={info} loading={false} advancePercent={100}
            amounts={{ subtotal: 3000, originalSubtotal: 3000, vat: 0, vatRate: null, total: 3000, advance: 3000, balance: 0 }} />);
        expect(screen.getByText("Balance payable at venue").parentElement!.textContent).toContain("৳0");
    });
});
