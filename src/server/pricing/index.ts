import { branches } from "@/data/branches";
import { pitches } from "@/data/pitches";
import { priceAdjustments, pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { advanceAmount, advancePercentAt, sportAdvance, sportConfigFor, type SportAdvance } from "@/lib/advance";
import { adjustmentCovers, applyDiscount, priceWithTemporary, vatTotals } from "@/lib/pricing";
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

// Order of precedence for one cell — exactly ONE change is ever applied:
//   1. A dated slot price (older rule with effectiveFrom/To) is a hand-set price for
//      that period: it is used with its own discount, temporary prices are ignored.
//   2. Otherwise the regular price, with the temporary price covering the cell or the
//      regular discount (never both); see priceWithTemporary in lib/pricing:
//      increase -> the increase; reduction -> the lower of reduction / regular discount;
//      none -> the regular discount.
// When the temporary price ends, the regular discount applies again by itself.
export function priceForCell(pitchId: string, cellStart: Date) {
    const rule = ruleFor(pitchId, cellStart);
    if (!rule) return null;
    const dated = !!(rule.effectiveFrom || rule.effectiveTo);
    const priced = dated
        ? applyDiscount(rule.pricePerSlot, rule.discountType, rule.discountValue, rule.discountDirection ?? "DISCOUNT")
        : priceWithTemporary(rule, adjustmentFor(pitchId, cellStart));
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
    vatMode: "inclusive" | "exclusive";
}

/**
 * The advance percentages for the sport played on this pitch (Setup → Venue → sport).
 * A sport saved before sport-wise advances existed uses the venue-wide Policies values.
 */
export function advanceForPitch(pitchId: string): SportAdvance {
    const pitch = pitches.find((p) => p.id === pitchId);
    const branch = pitch ? branches.find((b) => b.id === pitch.branchId) : undefined;
    const cfg = pitch ? sportConfigFor(branch, pitch.sport) : undefined;
    return sportAdvance(cfg, policies);
}

export function quote(pitchId: string, cellStarts: Date[]): Quote {
    const { advancePercent, vatRatePercent, vatMode } = policies;
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
    const { vat, total } = vatTotals(subtotal, vatRatePercent, vatMode);

    // --- Sport-wise, time-based advance: the pitch's sport sets its own day (6 AM–12 AM)
    // and night (12 AM–6 AM) percentage, any whole 0–100. 0% = no advance (৳0); any other
    // percentage never rounds down to ৳0 (see advanceAmount).
    const { minutes: startMinutes } = dhakaParts(cellStarts[0]);
    const effectiveAdvancePercent = advancePercentAt(advanceForPitch(pitchId), startMinutes);
    const advance = advanceAmount(total, effectiveAdvancePercent);
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
        vatMode,
    };
}