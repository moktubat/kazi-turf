// @vitest-environment happy-dom
// Check-in with a balance due (2026-11-25): nothing is pre-selected. Staff must say whether
// the customer paid now (cash recorded) or will pay later (Checked in · Due). Before, the
// "collect in cash" box was ticked by default and recorded cash nobody had received.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CHECKIN_BALANCE_PROMPT, CheckInForm } from "@/components/pages/admin/ActionForms";
import type { AdminBookingDto } from "@/types/admin";

const b = (collectBalance: boolean) =>
    ({
        code: "KT-PRFJ3G",
        customerName: "Nabil",
        phone: "01346864880",
        balanceDue: collectBalance ? 1700 : 0,
        checkIn: { state: "VALID", message: "Check-in is open.", opensAt: "" },
        can: { checkIn: true, overrideCheckIn: false, collectBalance, cancel: true, refund: false, handleRequest: false },
    }) as unknown as AdminBookingDto;

afterEach(cleanup);

function setup(booking: AdminBookingDto) {
    const onSubmit = vi.fn();
    render(<CheckInForm b={booking} busy={false} onSubmit={onSubmit} onBack={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/I confirmed the name/));
    return { onSubmit, submit: () => fireEvent.click(screen.getByRole("button", { name: "Check in" })) };
}

describe("check-in balance choice", () => {
    it("neither option is selected at first, and submitting without choosing is refused", () => {
        const { onSubmit, submit } = setup(b(true));
        expect((screen.getByLabelText(/Paid now/) as HTMLInputElement).checked).toBe(false);
        expect((screen.getByLabelText(/Not paid yet/) as HTMLInputElement).checked).toBe(false);
        submit();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert").textContent).toBe(CHECKIN_BALANCE_PROMPT);
    });

    it("'Not paid yet' checks in with the balance still due (no cash recorded)", () => {
        const { onSubmit, submit } = setup(b(true));
        fireEvent.click(screen.getByLabelText(/Not paid yet: check in with ৳1,700 due/));
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ identity: { method: "NAME" }, collectBalance: false });
    });

    it("'Paid now' records the balance in cash", () => {
        const { onSubmit, submit } = setup(b(true));
        fireEvent.click(screen.getByLabelText(/Paid now: I received ৳1,700 in cash/));
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ identity: { method: "NAME" }, collectBalance: true });
    });

    it("a fully paid booking shows no choice and checks in straight away", () => {
        const { onSubmit, submit } = setup(b(false));
        expect(screen.queryByLabelText(/Paid now/)).toBeNull();
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ identity: { method: "NAME" }, collectBalance: false });
    });
});
