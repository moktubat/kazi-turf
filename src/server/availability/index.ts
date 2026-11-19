// ONE availability function: powers Home "Open Today", /book and the Staff Desk board.
// Pitches are loaded into the in-memory `pitches` array by ensureConfig() at the
// start of each request (see src/server/config). Claims come from MongoDB.
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
    cellStart: string;
    start: string;
    end: string;
    status: SlotStatus;
    price: number;           // discounted (effective) price
    originalPrice: number;   // pre-dispatch price (same as price when no discount)
    hasDiscount: boolean;    // price differs from originalPrice (reduction or increase)
    tier: string;
    // True when this HELD claim is a staff hold (admin "Hold this slot", no booking
    // attached). /book renders those as "Booked" so customers cannot tell the
    // difference; the Staff Desk board keeps showing the real "Held" state.
    staffHold?: boolean;
}

export interface AvailabilityOptions {
    /** Staff only: a slot already in progress still counts as open (walk-ins). */
    allowStarted?: boolean;
    /** Skip the 30 s display cache. Every check that decides a write (book, walk-in, hold) uses this. */
    fresh?: boolean;
}

// Sync lookups — reads from the in-memory `pitches` array populated by ensureConfig().
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

const CELL_CACHE_TTL_MS = 30_000; // 30 seconds
const cellCache = new Map<string, { at: number; cells: Cell[] }>();

/**
 * Drop cached cells after a claim or price change so the Staff Desk board and
 * /book show the new status/price at once instead of up to 30 s later.
 * No pitch given = clear everything (the cache is small).
 */
export function invalidateAvailability(pitchId?: string) {
    if (!pitchId) {
        cellCache.clear();
        return;
    }
    for (const key of cellCache.keys()) if (key.startsWith(`${pitchId}|`)) cellCache.delete(key);
}

async function loadClaims(pitchIds: string[], fromIso: string, toIso: string): Promise<SlotClaim[]> {
    if (pitchIds.length === 0) return [];
    await connectDb();
    const docs = await SlotClaimModel.find({
        pitchId: { $in: pitchIds },
        cellStart: { $gte: fromIso, $lt: toIso },
    }).lean();
    return plainAll<SlotClaim>(docs);
}

/** Pure: the field's own slot grid (pitch.slotMinutes) from opening time, minus the given claims. */
function buildCells(pitch: Pitch, date: string, claims: SlotClaim[], now: Date, opts: AvailabilityOptions): Cell[] {
    const step = pitch.slotMinutes ?? policies.slotMinutes; // per-pitch slot length
    const open = toMinutes(pitch.openTime);   // "00:00" — 24-hour turf
    const close = toMinutes(pitch.closeTime);

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
        let staffHold: boolean | undefined;
        const claim = active.get(iso);
        if (claim) {
            status = claim.state;
            // A HELD claim without a booking is a staff hold; a customer's online
            // payment hold carries a bookingId and keeps showing as "Held".
            staffHold = claim.state === "HELD" && !claim.bookingId;
        }
        else if ((opts.allowStarted ? endDate : startDate) <= now) status = "PAST";
        cells.push({
            pitchId: pitch.id,
            cellStart: iso,
            start: toHHMM(m),
            end: toHHMM(m + step),
            status,
            staffHold,
            price: rate.price,
            originalPrice: rate.originalPrice,
            // Any change from the normal price (up OR down): the /book chips use
            // price vs originalPrice to tell a reduction from an increase.
            hasDiscount: rate.hasAdjustment,
            tier: rate.tier,
        });
    }
    return cells;
}

/** Cells for one pitch from claims the caller already loaded (the Staff Desk board loads the day's claims once). */
export function pitchCellsFromClaims(pitchId: string, date: string, claims: SlotClaim[], now: Date, opts: AvailabilityOptions = {}): Cell[] {
    const pitch = getPitch(pitchId);
    return pitch ? buildCells(pitch, date, claims, now, opts) : [];
}

/** Batch-load availability for all pitches of a branch+sport in ONE Mongo query. */
export async function getBranchAvailability(
    branchId: string,
    sport: string,
    date: string,
    now: Date = new Date(),
    opts: AvailabilityOptions = {}
): Promise<{ pitch: Pitch; cells: Cell[] }[]> {
    const list = getBranchPitches(branchId, sport);
    if (list.length === 0) return [];
    const [from, to] = dayRange(date);
    const claims = await loadClaims(list.map((p) => p.id), from, to);
    return list.map((pitch) => ({
        pitch,
        cells: buildCells(pitch, date, claims, now, opts),
    }));
}

export async function getPitchAvailability(
    pitchId: string,
    date: string,
    now: Date = new Date(),
    opts: AvailabilityOptions = {}
): Promise<Cell[]> {
    const pitch = getPitch(pitchId);
    if (!pitch) return [];
    const cacheKey = `${pitchId}|${date}|${opts.allowStarted ? "1" : "0"}`;
    const [from, to] = dayRange(date);
    // A fresh read reflects holds that just expired, claims freed by another server instance
    // and slots that just started; the cached copy can be up to 30 s behind on all three.
    if (opts.fresh) return buildCells(pitch, date, await loadClaims([pitchId], from, to), now, opts);
    const cached = cellCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CELL_CACHE_TTL_MS) return cached.cells;
    const cells = buildCells(pitch, date, await loadClaims([pitchId], from, to), now, opts);
    cellCache.set(cacheKey, { at: Date.now(), cells });
    if (cellCache.size > 500) {
        // Evict oldest 25% to bound memory.
        const entries = [...cellCache.entries()].sort((a, b) => a[1].at - b[1].at);
        for (let i = 0; i < Math.floor(entries.length / 4); i++) cellCache.delete(entries[i][0]);
    }
    return cells;
}

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