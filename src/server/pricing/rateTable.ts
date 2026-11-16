import { priceAdjustments, pricingRules } from "@/data/pricing";
import { formatTime12 } from "@/lib/format";
import { applyDiscount, priceWithTemporary } from "@/lib/pricing";
import { toMinutes } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import type { PricingRule } from "@/types";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(days: number[]): string {
    const d = [...days].sort((a, b) => a - b);
    if (d.length === 1) return DAY[d[0]];
    const contiguous = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
    if (d.length === 7) return "Every day";
    return contiguous ? `${DAY[d[0]]}–${DAY[d[d.length - 1]]}` : d.map((x) => DAY[x]).join(", ");
}

export type DayPeriod = "Night" | "Morning" | "Afternoon" | "Evening";

export interface RateCell {
    period: DayPeriod;          // from the window's start time (customer-friendly label)
    start: string;              // "HH:MM", for sorting and tests
    price: number;              // what the customer pays today (discounts / temporary prices applied)
    originalPrice: number;      // regular price before any change
    hasDiscount: boolean;
    hasSurcharge: boolean;
    hasAdjustment: boolean;
    window: string;             // "06:00 AM–12:00 PM"
}

/** One weekday group (e.g. "Sun–Thu") with ALL its time windows, earliest first. */
export interface RateRow {
    days: string;
    windows: RateCell[];
}

/** 05:00–11:59 Morning, 12:00–16:59 Afternoon, 17:00–20:59 Evening, otherwise Night. */
export function periodOf(start: string): DayPeriod {
    const m = toMinutes(start);
    if (m >= 5 * 60 && m < 12 * 60) return "Morning";
    if (m >= 12 * 60 && m < 17 * 60) return "Afternoon";
    if (m >= 17 * 60 && m < 21 * 60) return "Evening";
    return "Night";
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
    const active = pricingRules.filter(
        (x) =>
            x.pitchId === pitchId &&
            (!x.effectiveFrom || today >= x.effectiveFrom) &&
            (!x.effectiveTo || today <= x.effectiveTo)
    );
    // An older date-limited price running today wins over the always-on price it overlaps
    // (same as ruleFor in booking), so the always-on one is not listed next to it.
    const dated = active.filter(isDated);
    const key = (r: PricingRule) => [...r.days].sort((a, b) => a - b).join(",");
    const overlaps = (a: PricingRule, b: PricingRule) =>
        toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
    const shown = active.filter((r) => isDated(r) || !dated.some((d) => key(d) === key(r) && overlaps(d, r)));

    const groups = new Map<string, { days: number[]; row: RateRow }>();
    for (const r of shown) {
        const k = key(r);
        const g = groups.get(k) ?? { days: [...r.days].sort((a, b) => a - b), row: { days: dayLabel(r.days), windows: [] } };
        const priced = isDated(r)
            ? applyDiscount(r.pricePerSlot, r.discountType, r.discountValue, r.discountDirection ?? "DISCOUNT")
            : priceWithTemporary(r, seasonalFor(r, today)); // same rule as booking (lib/pricing)
        g.row.windows.push({
            period: periodOf(r.startTime),
            start: r.startTime,
            price: priced.discounted,
            originalPrice: priced.original,
            hasDiscount: priced.hasDiscount,
            hasSurcharge: priced.hasSurcharge,
            hasAdjustment: priced.hasAdjustment,
            window: `${formatTime12(r.startTime)}–${formatTime12(r.endTime)}`,
        });
        groups.set(k, g);
    }
    // Weekday groups in week order (Sun–Thu before Fri–Sat), windows earliest first.
    return [...groups.values()]
        .sort((a, b) => a.days[0] - b.days[0] || b.days.length - a.days.length)
        .map(({ row }) => ({ ...row, windows: row.windows.sort((a, b) => toMinutes(a.start) - toMinutes(b.start)) }));
}
