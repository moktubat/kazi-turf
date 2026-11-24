// Admin feedback copy, kept in one place so the screens say the same thing and tests can check it.

/** Count line above the Bookings list: numbered pagination with a known total. */
export function countLabel(shown: number, total: number, page: number, pages: number): string {
    const noun = total === 1 ? "booking" : "bookings";
    if (pages <= 1) return `${total} ${noun}`;
    return `Showing ${shown} of ${total} ${noun} · Page ${page} of ${pages}`;
}

/** Booking actions in the booking drawer (the last part of /api/admin/bookings/[code]/…). */
export type BookingAction =
    | "check-in"
    | "check-out"
    | "undo-check-out"
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
        case "check-out":
            return "Checked out. Payment complete and the booking is closed.";
        case "undo-check-out":
            return "Check-out undone. The booking is back to Checked in.";
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