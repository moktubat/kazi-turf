// Reason staff give when checking a customer in outside the normal check-in window.
// Optional: an empty reason is fine, but a typed one must be at least 5 characters.

export const CHECKIN_REASON_MIN = 5;
export const CHECKIN_REASON_MAX = 200;

export const CHECKIN_OUTSIDE_PROMPT = "Add a reason (5+ characters) to check in outside the normal rules.";
export const CHECKIN_REASON_TOO_SHORT = `Reason must be at least ${CHECKIN_REASON_MIN} characters, or leave it empty.`;

export const CHECKIN_REASON_PICKS = [
    "Customer arrived early",
    "Customer arrived late",
    "Previous slot ended early",
    "Field was free",
    "Manager approved",
] as const;

/** Error text for a reason, or null when it is empty or long enough. */
export function checkInReasonError(reason: string): string | null {
    const r = reason.trim();
    if (r.length === 0) return null;
    if (r.length < CHECKIN_REASON_MIN) return CHECKIN_REASON_TOO_SHORT;
    if (r.length > CHECKIN_REASON_MAX) return `Keep it under ${CHECKIN_REASON_MAX} characters.`;
    return null;
}
