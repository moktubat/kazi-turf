import type { SlotClaim } from "@/types";
import { addDays, dhakaToUtc } from "@/lib/time";
const at = (date: string, minutes: number) => dhakaToUtc(date, minutes).toISOString();

/** Demo claims relative to a given "today". Call from a Server Component / route. */
export function getDemoClaims(today: string): SlotClaim[] {
    const tomorrow = addDays(today, 1);
    return [
        { pitchId: "bogura-a", cellStart: at(today, 19 * 60 + 30), state: "BOOKED", bookingId: "demo-1" },
        { pitchId: "bogura-a", cellStart: at(today, 21 * 60), state: "BOOKED", bookingId: "demo-2" },
        { pitchId: "bogura-a", cellStart: at(tomorrow, 18 * 60), state: "BOOKED", bookingId: "demo-3" },
        { pitchId: "bogura-b", cellStart: at(today, 18 * 60), state: "BOOKED", bookingId: "demo-4" },
        { pitchId: "bogura-b", cellStart: at(today, 7 * 60 + 30), state: "MAINTENANCE", reason: "Turf repair" },
        { pitchId: "bogura-c", cellStart: at(tomorrow, 10 * 60 + 30), state: "BOOKED", bookingId: "demo-5" },
    ];
}