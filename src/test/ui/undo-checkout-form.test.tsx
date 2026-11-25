// @vitest-environment happy-dom
// Undo check-out form (2026-11-25): when a cash balance can be reversed, staff must choose
// "Keep it" or "Reverse it" (nothing pre-selected); the form says where the booking goes back to.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UNDO_CHECKOUT_MONEY_PROMPT, UndoCheckOutForm } from "@/components/pages/admin/ActionForms";
import type { AdminBookingDto } from "@/types/admin";

const b = (over: Partial<AdminBookingDto>) =>
    ({
        code: "KT-W49JFB", customerName: "Testing 001", checkedInAt: null,
        reversibleCash: { id: "p2", amount: 900, at: "2026-11-25T06:34:00.000Z" }, ...over,
    }) as unknown as AdminBookingDto;

afterEach(cleanup);

function setup(booking: AdminBookingDto) {
    const onSubmit = vi.fn();
    render(<UndoCheckOutForm b={booking} busy={false} onSubmit={onSubmit} onBack={vi.fn()} />);
    return { onSubmit, submit: () => fireEvent.submit(screen.getByRole("form", { name: "Undo check-out" })) };
}

describe("UndoCheckOutForm", () => {
    it("says it goes back to Booked when never checked in, and to Checked in otherwise", () => {
        setup(b({}));
        expect(screen.getByText("Booked")).toBeTruthy();
        cleanup();
        setup(b({ checkedInAt: "2026-11-25T09:00:00.000Z" }));
        expect(screen.getByText("Checked in")).toBeTruthy();
    });

    it("requires a choice about the ৳900 cash", () => {
        const { onSubmit, submit } = setup(b({}));
        expect((screen.getByLabelText(/Keep it/) as HTMLInputElement).checked).toBe(false);
        expect((screen.getByLabelText(/Reverse it/) as HTMLInputElement).checked).toBe(false);
        submit();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole("alert").textContent).toBe(UNDO_CHECKOUT_MONEY_PROMPT);
    });

    it("'Reverse it' sends reverseBalance; 'Keep it' does not", () => {
        const { onSubmit, submit } = setup(b({}));
        fireEvent.click(screen.getByLabelText(/Reverse it: not received/));
        expect(screen.getByRole("button", { name: "Undo check-out and reverse ৳900" })).toBeTruthy();
        submit();
        expect(onSubmit).toHaveBeenLastCalledWith({ reason: undefined, reverseBalance: true });
        fireEvent.click(screen.getByLabelText(/Keep it: the customer paid ৳900/));
        submit();
        expect(onSubmit).toHaveBeenLastCalledWith({ reason: undefined });
    });

    it("with nothing to reverse there is no choice", () => {
        const { onSubmit, submit } = setup(b({ reversibleCash: null }));
        expect(screen.queryByLabelText(/Reverse it/)).toBeNull();
        submit();
        expect(onSubmit).toHaveBeenCalledWith({ reason: undefined });
    });
});
