export interface Priced {
    original: number;
    discounted: number;
    hasDiscount: boolean;       // final < original
    hasSurcharge: boolean;      // final > original
    hasAdjustment: boolean;     // final !== original (either direction)
}

export function applyDiscount(
    price: number,
    discountType: "PERCENT" | "FIXED" | null,
    discountValue: number | null,
    discountDirection: "DISCOUNT" | "SURCHARGE" | null = "DISCOUNT"
): Priced {
    // No adjustment — return as-is.
    if (!discountType || !discountValue || discountValue <= 0 || !discountDirection) {
        return {
            original: price,
            discounted: price,
            hasDiscount: false,
            hasSurcharge: false,
            hasAdjustment: false,
        };
    }

    let delta = 0;
    if (discountType === "PERCENT") {
        delta = Math.round((price * discountValue) / 100);
    } else {
        // FIXED
        delta = discountValue;
    }

    let final = price;
    if (discountDirection === "DISCOUNT") {
        final = price - delta;
    } else {
        // SURCHARGE
        final = price + delta;
    }

    if (final < 0) final = 0;

    return {
        original: price,
        discounted: final,
        hasDiscount: final < price,
        hasSurcharge: final > price,
        hasAdjustment: final !== price,
    };
}
/** Does a date-range adjustment cover this cell? `minutes` = cell start, Dhaka minutes since midnight. */
export function adjustmentCovers(
    a: { pitchIds: string[]; effectiveFrom: string; effectiveTo: string; days: number[]; startTime: string; endTime: string },
    pitchId: string,
    date: string,
    dow: number,
    minutes: number
): boolean {
    if (!a.pitchIds.includes(pitchId)) return false;
    if (date < a.effectiveFrom || date > a.effectiveTo) return false;
    if (!a.days.includes(dow)) return false;
    const [sh, sm] = a.startTime.split(":").map(Number);
    const [eh, em] = a.endTime.split(":").map(Number);
    return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
}

/**
 * Temporary (date-range) price change applied to a regular price.
 * PRICE  = the slot simply costs `value` during the period (e.g. ৳2,000 → ৳2,500).
 * FIXED  = add / take off `value` taka.  PERCENT = add / take off `value` %.
 */
export function applyPriceAdjustment(
    price: number,
    a: { direction: "DISCOUNT" | "SURCHARGE"; type: "PERCENT" | "FIXED" | "PRICE"; value: number }
): Priced {
    if (a.type !== "PRICE") return applyDiscount(price, a.type, a.value, a.direction);
    const final = Math.max(0, a.value);
    return {
        original: price,
        discounted: final,
        hasDiscount: final < price,
        hasSurcharge: final > price,
        hasAdjustment: final !== price,
    };
}
