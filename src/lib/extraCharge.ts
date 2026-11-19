// Optional additional charge staff can add on a walk-in (drinks, damage, special
// request…). It is ADDED after the discount (subtotal − discount + charge), VAT is
// worked out on the result, and the payable total can only go up. The reason and the
// amount are BOTH optional: a reason without an amount adds nothing, an amount
// without a reason is fine.
// Pure functions: the walk-in form previews with them and the server re-checks with
// the very same code, so the screen and the saved booking always match.
import { formatBDT } from "./format";

export const EXTRA_CHARGE_REASON_MAX = 120;
export const EXTRA_CHARGE_MAX = 1_000_000;

export interface ExtraCharge {
    /** Optional note shown on the receipt, e.g. "Damaged net". */
    reason?: string;
    /** Whole taka ADDED to the total. */
    amount: number;
}

/** Returns an error message for the amount, or null when the charge is usable. */
export function extraChargeError(c: ExtraCharge | null | undefined): string | null {
    if (!c) return null;
    if (!Number.isInteger(c.amount) || c.amount < 0) return "Enter a whole number, 0 or more";
    if (c.amount > EXTRA_CHARGE_MAX) return `At most ${formatBDT(EXTRA_CHARGE_MAX)}`;
    return null;
}

/** The taka amount to add: 0 when there is no charge (or the amount is not positive). */
export function extraChargeAmount(c: ExtraCharge | null | undefined): number {
    if (!c || !(c.amount > 0) || !Number.isInteger(c.amount)) return 0;
    return Math.min(EXTRA_CHARGE_MAX, c.amount);
}