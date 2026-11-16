import { priceAdjustments, pricingRules } from "@/data/pricing";
import { formatTime12 } from "@/lib/format";
import { applyDiscount, applyPriceAdjustment } from "@/lib/pricing";
import { toMinutes } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import type { PricingRule } from "@/types";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(days: number[]): string {
    const d = [...days].sort((a, b) => a - b);
    if (d.length === 1) return DAY[d[0]];
    const contiguous = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
    return contiguous ? `${DAY[d[0]]}–${DAY[d[d.length - 1]]}` : d.map((x) => DAY[x]).join(", ");
}

export interface RateCell {
    price: number;              // effective (adjusted) price
    originalPrice: number;      // base price before adjustment
    hasDiscount: boolean;
    hasSurcharge: boolean;
    hasAdjustment: boolean;
    window: string;
}

export interface RateRow {
    days: string;
    offPeak: RateCell | null;
    peak: RateCell | null;
}

const isDated = (r: PricingRule) => !!(r.effectiveFrom || r.effectiveTo);

/**
 * A seasonal adjustment active today that covers the WHOLE window of an
 * always-on rule (every day and every slot of it). A partial overlap is not
 * shown here because one table cell cannot hold two prices; the booking grid
 * still shows the exact per-slot price.
 */
function seasonalFor(r: PricingRule, today: string) {
    if (isDated(r)) return null; // a dated price is never adjusted again
    return (
        priceAdjustments.find(
            (a) =>
                a.pitchIds.includes(r.pitchId) &&
                today >= a.effectiveFrom &&
                today <= a.effectiveTo &&
                r.days.every((d) => a.days.includes(d)) &&
                toMinutes(a.startTime) <= toMinutes(r.startTime) &&
                toMinutes(a.endTime) >= toMinutes(r.endTime)
        ) ?? null
    );
}

export async function getRateTable(pitchId: string, now?: Date): Promise<RateRow[]> {
    const today = await todayDhaka(now);
    const rows = new Map<string, RateRow>();
    const active = pricingRules
        .filter(
            (x) =>
                x.pitchId === pitchId &&
                (!x.effectiveFrom || today >= x.effectiveFrom) &&
                (!x.effectiveTo || today <= x.effectiveTo)
        )
        // Dated rules last, so on their dates they win over the always-on price (same as ruleFor).
        .sort((a, b) => Number(isDated(a)) - Number(isDated(b)));
    for (const r of active) {
        const key = [...r.days].sort((a, b) => a - b).join(",");
        const row = rows.get(key) ?? { days: dayLabel(r.days), offPeak: null, peak: null };
        const seasonal = seasonalFor(r, today);
        const priced = seasonal
            ? applyPriceAdjustment(r.pricePerSlot, seasonal)
            : applyDiscount(r.pricePerSlot, r.discountType, r.discountValue, r.discountDirection ?? "DISCOUNT");
        const cell: RateCell = {
            price: priced.discounted,
            originalPrice: priced.original,
            hasDiscount: priced.hasDiscount,
            hasSurcharge: priced.hasSurcharge,
            hasAdjustment: priced.hasAdjustment,
            window: `${formatTime12(r.startTime)}–${formatTime12(r.endTime)}`,
        };
        if (r.tier === "Peak") row.peak = cell;
        else row.offPeak = cell;
        rows.set(key, row);
    }
    return [...rows.values()];
}
