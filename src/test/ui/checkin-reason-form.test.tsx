// @vitest-environment happy-dom
// Check-in form outside the normal window: the prompt, optional reason with quick picks,
// 5-character minimum only when a reason is typed, and what is sent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CheckInForm } from "@/components/pages/admin/ActionForms";
import { CHECKIN_OUTSIDE_PROMPT, CHECKIN_REASON_PICKS, CHECKIN_REASON_TOO_SHORT } from "@/lib/checkInReason";
import type { AdminBookingDto, CheckInState } from "@/types/admin";

const MESSAGES: Record<CheckInState, string> = {
    OUTSIDE_WINDOW: "Check-in opens at 6:00 PM.",
    BLOCKED: "Already checked in.",
    VALID: "",
};

const mkB = (state: CheckInState, over: Partial<AdminBookingDto["can"]> = {}) =>
    ({
        code: "KT-TEST22",
        customerName: "Rahim",
        phone: "01711112222",
        balanceDue: 0,
        checkIn: { state, message: MESSAGES[state], opensAt: "" },
        can: { checkIn: state !== "BLOCKED", overrideCheckIn: false, collectBalance: false, cancel: true, refund: false, handleRequest: false, ...over },
    }) as unknown as AdminBookingDto;

afterEach(cleanup);

function setup(b: AdminBookingDto) {
    const onSubmit = vi.fn();
    render(<CheckInForm b={b} busy={false} onSubmit={onSubmit} onBack={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/I confirmed the name/));
    const submit = () => fireEvent.click(screen.getByRole("button", { name: b.can.overrideCheckIn ? "Override check-in" : "Check in" }));
    return { onSubmit, submit };
}

describe("CheckInForm outside the window", () => {
    it("shows the prompt, an optional reason and quick picks", () => {
        setup(mkB("OUTSIDE_WINDOW"));
        expect(screen.getByText((t) => t.includes(CHECKIN_OUTSIDE_PROMPT))).toBeTruthy();
        expect(screen.getByLabelText("Reason (optional)")).toBeTruthy();
        const group = screen.getByRole("group", { name: "Quick pick reason" });
        for (const p of CHECKIN_REASON_PICKS) expect(group.textContent).toContain(p);
    });

    it("checks in with an empty reason and sends no reason", () => {
        const { onSubmit, submit } = setup(mkB("OUTSIDE_WINDOW"));
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ identity: { method: "NAME" }, collectBalance: false });
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("treats a whitespace-only reason as empty", () => {
        const { onSubmit, submit } = setup(mkB("OUTSIDE_WINDOW"));
        fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "    " } });
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ identity: { method: "NAME" }, collectBalance: false });
    });

    it("blocks a typed reason shorter than 5 characters", () => {
        const { onSubmit, submit } = setup(mkB("OUTSIDE_WINDOW"));
        fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "late" } });
        submit();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert").textContent).toBe(CHECKIN_REASON_TOO_SHORT);
    });

    it("sends a custom reason trimmed", () => {
        const { onSubmit, submit } = setup(mkB("OUTSIDE_WINDOW"));
        fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "  Team came 20 min early  " } });
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ identity: { method: "NAME" }, collectBalance: false, overrideReason: "Team came 20 min early" });
    });

    it("quick pick fills the reason, toggles off, and is sent", () => {
        const { onSubmit, submit } = setup(mkB("OUTSIDE_WINDOW"));
        const reason = screen.getByLabelText("Reason (optional)") as HTMLTextAreaElement;
        const pick = screen.getByRole("button", { name: "Customer arrived early" });
        fireEvent.click(pick);
        expect(reason.value).toBe("Customer arrived early");
        expect(pick.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(pick);
        expect(reason.value).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Manager approved" }));
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ identity: { method: "NAME" }, collectBalance: false, overrideReason: "Manager approved" });
    });
});

describe("CheckInForm inside the window / Super Admin override", () => {
    it("shows no reason field inside the normal window", () => {
        const { onSubmit, submit } = setup(mkB("VALID"));
        expect(screen.queryByLabelText("Reason (optional)")).toBeNull();
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ identity: { method: "NAME" }, collectBalance: false });
    });

    it("a Super Admin re-check-in still requires a reason", () => {
        const { onSubmit, submit } = setup(mkB("BLOCKED", { overrideCheckIn: true }));
        submit();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert").textContent).toBe(CHECKIN_OUTSIDE_PROMPT);
    });
});
