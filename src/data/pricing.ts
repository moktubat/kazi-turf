import type { PricingRule } from "@/types";
import { shared } from "@/lib/shared";

const WEEKDAY = [0, 1, 2, 3, 4]; // Sun-Thu
const WEEKEND = [5, 6]; // Fri-Sat

function rates(
    pitchId: string,
    p: { offWd: number; peakWd: number; offWe: number; peakWe: number }
): PricingRule[] {
    return [
        { id: `${pitchId}-wd-off`, pitchId, days: WEEKDAY, startTime: "06:00", endTime: "16:30", pricePerSlot: p.offWd, tier: "Off-peak" },
        { id: `${pitchId}-wd-peak`, pitchId, days: WEEKDAY, startTime: "16:30", endTime: "24:00", pricePerSlot: p.peakWd, tier: "Peak" },
        { id: `${pitchId}-we-off`, pitchId, days: WEEKEND, startTime: "06:00", endTime: "16:30", pricePerSlot: p.offWe, tier: "Off-peak" },
        { id: `${pitchId}-we-peak`, pitchId, days: WEEKEND, startTime: "16:30", endTime: "24:00", pricePerSlot: p.peakWe, tier: "Peak" },
    ];
}

// Sample prices in BDT per 90-minute slot [CONFIRM]
export const pricingRules: PricingRule[] = shared<PricingRule[]>("pricingRules", [
    ...rates("bogura-a", { offWd: 2400, peakWd: 3200, offWe: 2800, peakWe: 3600 }),
    ...rates("bogura-b", { offWd: 1600, peakWd: 2200, offWe: 1900, peakWe: 2500 }),
    ...rates("bogura-c", { offWd: 1800, peakWd: 2400, offWe: 2000, peakWe: 2700 }),
]);