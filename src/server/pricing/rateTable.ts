// Builds the public rate table from the same pricing data used by quote().
import { pricingRules } from "@/data/pricing";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(days: number[]): string {
    const d = [...days].sort((a, b) => a - b);
    if (d.length === 1) return DAY[d[0]];
    const contiguous = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
    return contiguous ? `${DAY[d[0]]}–${DAY[d[d.length - 1]]}` : d.map((x) => DAY[x]).join(", ");
}

export interface RateCell {
    price: number;
    window: string;
}

export interface RateRow {
    days: string;
    offPeak: RateCell | null;
    peak: RateCell | null;
}

export function getRateTable(pitchId: string): RateRow[] {
    const rows = new Map<string, RateRow>();
    for (const r of pricingRules.filter((x) => x.pitchId === pitchId)) {
        const key = [...r.days].sort((a, b) => a - b).join(",");
        const row = rows.get(key) ?? { days: dayLabel(r.days), offPeak: null, peak: null };
        const cell = { price: r.pricePerSlot, window: `${r.startTime}–${r.endTime}` };
        if (r.tier === "Peak") row.peak = cell;
        else row.offPeak = cell;
        rows.set(key, row);
    }
    return [...rows.values()];
}