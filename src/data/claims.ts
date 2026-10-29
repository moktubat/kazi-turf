import type { SlotClaim } from "@/types";
import { addDays, dhakaToUtc, todayDhaka } from "@/lib/time";

// Demo claims relative to today so availability always shows a realistic mix.
// Replaced by the SlotClaim collection when the database layer is added.
const today = todayDhaka();
const tomorrow = addDays(today, 1);
const at = (date: string, minutes: number) => dhakaToUtc(date, minutes).toISOString();

export const claims: SlotClaim[] = [
    { pitchId: "bogura-a", cellStart: at(today, 19 * 60 + 30), state: "BOOKED", bookingId: "demo-1" },
    { pitchId: "bogura-a", cellStart: at(today, 21 * 60), state: "BOOKED", bookingId: "demo-2" },
    { pitchId: "bogura-a", cellStart: at(tomorrow, 18 * 60), state: "BOOKED", bookingId: "demo-3" },
    { pitchId: "bogura-b", cellStart: at(today, 18 * 60), state: "BOOKED", bookingId: "demo-4" },
    { pitchId: "bogura-b", cellStart: at(today, 7 * 60 + 30), state: "MAINTENANCE", reason: "Turf repair" },
    { pitchId: "bogura-c", cellStart: at(tomorrow, 10 * 60 + 30), state: "BOOKED", bookingId: "demo-5" },
];