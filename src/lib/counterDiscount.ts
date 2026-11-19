// Discount staff can give on a walk-in (counter) booking. Same two kinds as the slot
// price discounts in Setup: a fixed taka amount or a percentage. It comes off the
// priced subtotal (before VAT), VAT is worked out again on what is left, and the
// payable total can go down to ৳0 but never below.
// Pure functions: the walk-in form previews with them and the server re-checks with
// the very same code, so the screen and the saved booking always match.
import { advanceAmount } from "./advance";
import { formatBDT } from "./format";
import { vatTotals } from "./pricing";

export type CounterDiscountType = "FIXED" | "PERCENT";

export interface CounterDiscount {
    type: CounterDiscountType;
    /** Whole taka (FIXED) or whole percent 0–100 (PERCENT). */
    value: number;
}

/** The quote fields the discount works from (the server's Quote has all of them). */
export interface DiscountableQuote {
    subtotal: number;
    vat: number;
    total: number;
    advancePercent: number;
    vatRatePercent: number | null;
    vatMode: "inclusive" | "exclusive";
}

export interface DiscountedTotals {
    /** Taka taken off the subtotal (0 when there is no discount). */
    discountAmount: number;
    /** Subtotal before the discount, as priced. */
    subtotal: number;
    vat: number;
    /** Payable total after the discount (and VAT). */
    total: number;
    /** Payable total without the discount, for "was ৳X" displays. */
    originalTotal: number;
    /** Suggested advance on the discounted total, at the sport's percentage. */
    advance: number;
}

/** Returns an error message, or null when the discount is valid for this subtotal. */
export function counterDiscountError(d: CounterDiscount | null | undefined, subtotal: number): string | null {
    if (!d) return null;
    if (!Number.isInteger(d.value) || d.value < 0) return "Enter a whole number, 0 or more";
    if (d.type === "PERCENT" && d.value > 100) return "At most 100%";
    if (d.type === "FIXED" && d.value > subtotal) return `At most ${formatBDT(subtotal)} (the subtotal)`;
    return null;
}

export function counterDiscountAmount(d: CounterDiscount | null | undefined, subtotal: number): number {
    if (!d || !(d.value > 0)) return 0;
    const raw = d.type === "PERCENT" ? Math.round((subtotal * d.value) / 100) : d.value;
    return Math.min(subtotal, Math.max(0, raw));
}

/** Totals after the discount. Throws nothing: validate with counterDiscountError first. */
export function applyCounterDiscount(q: DiscountableQuote, d: CounterDiscount | null | undefined): DiscountedTotals {
    const discountAmount = counterDiscountAmount(d, q.subtotal);
    if (discountAmount === 0) {
        return {
            discountAmount: 0,
            subtotal: q.subtotal,
            vat: q.vat,
            total: q.total,
            originalTotal: q.total,
            advance: advanceAmount(q.total, q.advancePercent),
        };
    }
    const { vat, total } = vatTotals(q.subtotal - discountAmount, q.vatRatePercent, q.vatMode);
    return {
        discountAmount,
        subtotal: q.subtotal,
        vat,
        total,
        originalTotal: q.total,
        advance: advanceAmount(total, q.advancePercent),
    };
}
