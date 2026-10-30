// ONE availability function: powers Home "Open Today", /book and the Staff Desk board.
// Claims come from MongoDB. Pitches, hours and rates still come from the shared config (Batch 9 persists it).
import { pitches } from "@/data/pitches";
import { policies } from "@/data/site";
import { addDays, dhakaToUtc, toHHMM, toMinutes } from "@/lib/time";
import { SlotClaimModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import { priceForCell } from "@/server/pricing";
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

export interface AvailabilityOptions {
    /** Staff only: a slot already in progress still counts as open (walk-ins). */
    allowStarted?: boolean;
}

export function getPitch(pitchId: string): Pitch | undefined {
    return pitches.find((p) => p.id === pitchId);
}

export function getBranchPitches(branchId: string, sport?: string): Pitch[] {
    return pitches.filter(
        (p) => p.branchId === branchId && p.status === "ACTIVE" && (!sport || p.sport === sport)
    );
}

const dayRange = (date: string): [string, string] => [
    dhakaToUtc(date, 0).toISOString(),
    dhakaToUtc(addDays(date, 1), 0).toISOString(),
];

async function loadClaims(pitchIds: string[], fromIso: string, toIso: string): Promise<SlotClaim[]> {
    if (pitchIds.length === 0) return [];
    await connectDb();
    const docs = await SlotClaimModel.find({
        pitchId: { $in: pitchIds },
        cellStart: { $gte: fromIso, $lt: toIso },
    }).lean();
    return plainAll<SlotClaim>(docs);
}

/** Pure: fixed 90-minute grid from opening time (spec 8.3) minus the given claims. */
function buildCells(
    pitch: Pitch,
    date: string,
    claims: SlotClaim[],
    now: Date,
    opts: AvailabilityOptions
): Cell[] {
    const step = policies.slotMinutes;
    const open = toMinutes(pitch.openTime);
    const close = toMinutes(pitch.closeTime);

    // Expired HELD claims are ignored immediately. Server time is authoritative.
    const active = new Map<string, SlotClaim>();
    for (const c of claims) {
        if (c.pitchId !== pitch.id) continue;
        if (c.state === "HELD" && c.expiresAt && new Date(c.expiresAt) <= now) continue;
        active.set(c.cellStart, c);
    }

    const cells: Cell[] = [];
    for (let m = open; m + step <= close; m += step) {
        const startDate = dhakaToUtc(date, m);
        const endDate = dhakaToUtc(date, m + step);
        const iso = startDate.toISOString();
        const rate = priceForCell(pitch.id, startDate);
        if (!rate) continue;

        let status: SlotStatus = "AVAILABLE";
        const claim = active.get(iso);
        if (claim) status = claim.state;
        else if ((opts.allowStarted ? endDate : startDate) <= now) status = "PAST";

        cells.push({
            pitchId: pitch.id,
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

export async function getPitchAvailability(
    pitchId: string,
    date: string,
    now: Date = new Date(),
    opts: AvailabilityOptions = {}
): Promise<Cell[]> {
    const pitch = getPitch(pitchId);
    if (!pitch) return [];
    const [from, to] = dayRange(date);
    return buildCells(pitch, date, await loadClaims([pitchId], from, to), now, opts);
}

/** Next open slots for a branch (Home "Open Today"): one claims query for the whole branch. */
export async function getNextOpenSlots(branchId: string, date: string, limit = 4, sport?: string) {
    const list = getBranchPitches(branchId, sport);
    const [from, to] = dayRange(date);
    const claims = await loadClaims(list.map((p) => p.id), from, to);
    const now = new Date();

    const out: (Cell & { pitchName: string })[] = [];
    for (const pitch of list) {
        for (const cell of buildCells(pitch, date, claims, now, {})) {
            if (cell.status === "AVAILABLE") out.push({ ...cell, pitchName: pitch.name });
        }
    }
    return out.sort((a, b) => a.cellStart.localeCompare(b.cellStart)).slice(0, limit);
}

/** First date after `afterDate` (up to `lastDate`) with at least one open slot. One claims query for the range. */
export async function findNextAvailableDate(
    branchId: string,
    sport: string,
    afterDate: string,
    lastDate: string,
    now: Date = new Date()
): Promise<string | null> {
    const list = getBranchPitches(branchId, sport);
    const first = addDays(afterDate, 1);
    if (first > lastDate) return null;

    const claims = await loadClaims(
        list.map((p) => p.id),
        dhakaToUtc(first, 0).toISOString(),
        dhakaToUtc(addDays(lastDate, 1), 0).toISOString()
    );
    for (let d = first; d <= lastDate; d = addDays(d, 1)) {
        if (list.some((p) => buildCells(p, d, claims, now, {}).some((c) => c.status === "AVAILABLE"))) return d;
    }
    return null;
}