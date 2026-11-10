// Pure pricing helpers — safe to import from both client and server code.
import type { DiscountType } from "@/types";

export interface PricedSlot {
    original: number;
    discounted: number;
    hasDiscount: boolean;
}

/**
 * Apply a discount to a price.
 * - PERCENT: discountValue is 1–100 (e.g. 20 = 20% off)
 * - FIXED: discountValue is in BDT (e.g. 200 = 200 BDT off)
 * Returns hasDiscount=false when no discount is set or the result equals the original.
 */
export function applyDiscount(
    price: number,
    discountType: DiscountType | null | undefined,
    discountValue: number | null | undefined
): PricedSlot {
    if (!discountType || !discountValue || discountValue <= 0) {
        return { original: price, discounted: price, hasDiscount: false };
    }
    let discounted = price;
    if (discountType === "PERCENT") {
        discounted = Math.round((price * (100 - discountValue)) / 100);
    } else if (discountType === "FIXED") {
        discounted = price - discountValue;
    }
    // Never go below zero.
    discounted = Math.max(0, discounted);
    return {
        original: price,
        discounted,
        hasDiscount: discounted < price,
    };
}