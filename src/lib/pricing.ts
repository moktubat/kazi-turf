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