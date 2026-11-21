// Admin feedback copy, kept in one place so the screens say the same thing and tests can check it.

/** Count line above the Bookings list. `more`: another page exists ("Load more"). */
export function countLabel(shown: number, more: boolean): string {
    const noun = shown === 1 ? "booking" : "bookings";
    return more ? `Showing ${shown} ${noun}. More match these filters.` : `${shown} ${noun}`;
}

/** Booking actions in the booking drawer (the last part of /api/admin/bookings/[code]/…). */
export type BookingAction =
    | "check-in"
    | "collect-balance"
    | "cancel"
    | "refund"
    | "request"
    | "discount"
    | "charge"
    | "note"
    | "undo-check-in";

/** Confirmation shown after an action succeeds. */
export function actionSuccessMessage(action: BookingAction): string {
    switch (action) {
        case "check-in":
            return "Checked in.";
        case "collect-balance":
            return "Balance collected.";
        case "cancel":
            return "Booking cancelled.";
        case "refund":
            return "Refund recorded.";
        case "request":
            return "Request marked as handled.";
        case "discount":
            return "Discount updated.";
        case "charge":
            return "Charge updated.";
        case "note":
            return "Note saved.";
        case "undo-check-in":
            return "Check-in undone. The booking is back to Booked.";
    }
}