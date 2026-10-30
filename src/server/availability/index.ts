// ONE availability function: powers Home "Open Today", /book and the Staff Desk board.
import { pitches } from "@/data/pitches";
import { policies } from "@/data/site";
import { addDays, dhakaToUtc, toHHMM, toMinutes } from "@/lib/time";
import { priceForCell } from "@/server/pricing";
import { store } from "@/server/store";
import type { Pitch, SlotClaim, SlotStatus } from "@/types";

export interface Cell {
    pitchId: string;
    cellStart: string; // ISO UTC, claim key
    start: string; // "19:30" (Dhaka)
    end: string; // "21:00"
    status: SlotStatus;
    price: number;
    tier: string;
}

export function getPitch(pitchId: string): Pitch | undefined {
    return pitches.find((p) => p.id === pitchId);
}

export function getBranchPitches(branchId: string, sport?: string): Pitch[] {
    return pitches.filter(
        (p) => p.branchId === branchId && p.status === "ACTIVE" && (!sport || p.sport === sport)
    );
}

/** Fixed 90-minute grid from opening time (spec 8.3). */
export function getPitchAvailability(pitchId: string, date: string, now: Date = new Date()): Cell[] {
    const pitch = getPitch(pitchId);
    if (!pitch) return [];

    const step = policies.slotMinutes;
    const open = toMinutes(pitch.openTime);
    const close = toMinutes(pitch.closeTime);

    // Expired HELD claims are ignored immediately. Server time is authoritative.
    const active = new Map<string, SlotClaim>();
    for (const c of store.claims) {
        if (c.pitchId !== pitchId) continue;
        if (c.state === "HELD" && c.expiresAt && new Date(c.expiresAt) <= now) continue;
        active.set(c.cellStart, c);
    }

    const cells: Cell[] = [];
    for (let m = open; m + step <= close; m += step) {
        const startDate = dhakaToUtc(date, m);
        const iso = startDate.toISOString();
        const rate = priceForCell(pitchId, startDate);
        if (!rate) continue;

        let status: SlotStatus = "AVAILABLE";
        const claim = active.get(iso);
        if (claim) status = claim.state;
        else if (startDate <= now) status = "PAST";

        cells.push({
            pitchId,
            cellStart: iso,
            start: toHHMM(m),
            end: toHHMM(m + step),
            status,
            price: rate.price,
            tier: rate.tier,
        });
    }
    return cells;
}

/** Next open slots for a branch (Home "Open Today"). */
export function getNextOpenSlots(branchId: string, date: string, limit = 4, sport?: string) {
    const out: (Cell & { pitchName: string })[] = [];
    for (const pitch of getBranchPitches(branchId, sport)) {
        for (const cell of getPitchAvailability(pitch.id, date)) {
            if (cell.status === "AVAILABLE") out.push({ ...cell, pitchName: pitch.name });
        }
    }
    return out.sort((a, b) => a.cellStart.localeCompare(b.cellStart)).slice(0, limit);
}

/** First date after `afterDate` (up to `lastDate`) with at least one open slot. */
export function findNextAvailableDate(
    branchId: string,
    sport: string,
    afterDate: string,
    lastDate: string,
    now: Date = new Date()
): string | null {
    const list = getBranchPitches(branchId, sport);
    for (let d = addDays(afterDate, 1); d <= lastDate; d = addDays(d, 1)) {
        if (list.some((p) => getPitchAvailability(p.id, d, now).some((c) => c.status === "AVAILABLE"))) {
            return d;
        }
    }
    return null;
}