import { priceAdjustments, pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { adjustmentCovers, applyDiscount, applyPriceAdjustment } from "@/lib/pricing";
import { dhakaParts, toMinutes } from "@/lib/time";
import { AppError } from "@/server/http";
import type { PriceAdjustment, PricingRule } from "@/types";

// Which price applies to one cell: a rule matches by pitch, weekday and time
// window, and may be scoped to a date range. A date-scoped rule (Ramadan /
// vacation / Eid pricing created in Admin → Setup → Rates) always wins over the
// always-on price for the dates it covers — assertRule guarantees at most one
// scoped rule can match any given date, so there is never a tie.
export function ruleFor(pitchId: string, cellStart: Date): PricingRule | null {
    const { dow, minutes, date } = dhakaParts(cellStart);
    let base: PricingRule | null = null;
    for (const r of pricingRules) {
        if (r.pitchId !== pitchId || !r.days.includes(dow)) continue;
        if (minutes < toMinutes(r.startTime) || minutes >= toMinutes(r.endTime)) continue;
        if (r.effectiveFrom || r.effectiveTo) {
            if (r.effectiveFrom && date < r.effectiveFrom) continue;
            if (r.effectiveTo && date > r.effectiveTo) continue;
            return r; // date-scoped rule wins immediately
        }
        base ??= r; // first always-on rule as the fallback
    }
    return base;
}

/** The date-range adjustment (Seasonal pricing) covering this cell, if any. */
export function adjustmentFor(pitchId: string, cellStart: Date): PriceAdjustment | null {
    const { dow, minutes, date } = dhakaParts(cellStart);
    return priceAdjustments.find((a) => adjustmentCovers(a, pitchId, date, dow, minutes)) ?? null;
}

// Order of precedence for one cell — exactly ONE adjustment is ever applied:
//   1. A dated slot price (rule with effectiveFrom/To) is a hand-set price for
//      that period: it is used as-is and seasonal adjustments are ignored.
//   2. Otherwise a seasonal adjustment, if one covers the cell, is applied to
//      the regular base price and REPLACES the rule's own standing adjustment
//      (no stacking: "−10% promo" + "−20% Ramadan" = −20%, not −28%).
//   3. Otherwise the rule's own adjustment, as before.
// When the seasonal range ends, step 2 stops matching and step 3 applies again.
export function priceForCell(pitchId: string, cellStart: Date) {
    const rule = ruleFor(pitchId, cellStart);
    if (!rule) return null;
    const dated = !!(rule.effectiveFrom || rule.effectiveTo);
    const seasonal = dated ? null : adjustmentFor(pitchId, cellStart);
    const priced = seasonal
        ? applyPriceAdjustment(rule.pricePerSlot, seasonal)
        : applyDiscount(
            rule.pricePerSlot,
            rule.discountType,
            rule.discountValue,
            rule.discountDirection ?? "DISCOUNT"
        );
    return {
        price: priced.discounted,
        originalPrice: priced.original,
        hasDiscount: priced.hasDiscount,
        hasSurcharge: priced.hasSurcharge,
        hasAdjustment: priced.hasAdjustment,
        tier: rule.tier,
    };
}

export interface Quote {
    lines: {
        cellStart: string;
        price: number;
        originalPrice: number;
        hasDiscount: boolean;
        hasSurcharge: boolean;
        hasAdjustment: boolean;
        tier: string;
    }[];
    subtotal: number;
    originalSubtotal: number;
    adjustmentAmount: number;
    vat: number;
    total: number;
    advance: number;
    balance: number;
    advancePercent: number;
    vatRatePercent: number | null;
}

export function quote(pitchId: string, cellStarts: Date[]): Quote {
    const { advancePercent, nightAdvancePercent, vatRatePercent, vatMode } = policies;
    if (typeof advancePercent !== "number" || !Number.isFinite(advancePercent)) {
        throw new AppError("NO_RATE_FOR_SLOT", "Booking is not configured yet. Please contact the venue.", 500);
    }
    const lines = cellStarts.map((c) => {
        const p = priceForCell(pitchId, c);
        if (!p || !Number.isFinite(p.price) || p.price <= 0) {
            throw new AppError("NO_RATE_FOR_SLOT", "We could not price this slot. Pick another time.", 400);
        }
        return {
            cellStart: c.toISOString(),
            price: p.price,
            originalPrice: p.originalPrice,
            hasDiscount: p.hasDiscount,
            hasSurcharge: p.hasSurcharge,
            hasAdjustment: p.hasAdjustment,
            tier: p.tier,
        };
    });
    const subtotal = lines.reduce((s, l) => s + l.price, 0);
    const originalSubtotal = lines.reduce((s, l) => s + l.originalPrice, 0);
    const adjustmentAmount = subtotal - originalSubtotal;
    let vat = 0;
    let total = subtotal;
    if (vatRatePercent && vatMode === "exclusive") {
        vat = Math.round((subtotal * vatRatePercent) / 100);
        total = subtotal + vat;
    } else if (vatRatePercent) {
        vat = Math.round(subtotal - subtotal / (1 + vatRatePercent / 100));
    }

    // --- Time-based advance: night slots (00:00–06:00 Dhaka) use nightAdvancePercent ---
    const firstStart = cellStarts[0];
    const { minutes: startMinutes } = dhakaParts(firstStart);
    const NIGHT_START = 0;       // 00:00
    const NIGHT_END = 6 * 60;    // 06:00
    const isNight = startMinutes >= NIGHT_START && startMinutes < NIGHT_END;
    const effectiveAdvancePercent = isNight ? (nightAdvancePercent ?? 100) : advancePercent;

    const advance = Math.round((total * effectiveAdvancePercent) / 100);
    const balance = total - advance;
    if (![subtotal, vat, total, advance, balance].every(Number.isFinite)) {
        throw new AppError("NO_RATE_FOR_SLOT", "We could not price this slot. Pick another time.", 400);
    }
    return {
        lines,
        subtotal,
        originalSubtotal,
        adjustmentAmount,
        vat,
        total,
        advance,
        balance,
        advancePercent: effectiveAdvancePercent,
        vatRatePercent: vatRatePercent ?? null,
    };
}