// Sport-wise advance payment. Each sport in Setup → Venue carries its own advance
// percentage for day slots (6 AM–12 AM) and night slots (12 AM–6 AM), any whole
// number from 0 to 100. 0 = no advance: the whole price is paid at the venue.
//
// Sports saved before this setting existed have no percentages of their own; they
// keep using the venue-wide values from Policies (the old setting), so existing
// sports behave exactly as before until an admin changes them.
// Pure functions: shared by the server (quotes, bookings) and the browser (previews).
import type { Branch, Policies, SportConfig } from "@/types";

/** Slots STARTING in [00:00, 06:00) Dhaka time use the night percentage. */
export const NIGHT_START_MINUTES = 0;
export const NIGHT_END_MINUTES = 6 * 60;

export const MIN_ADVANCE_PERCENT = 0;
export const MAX_ADVANCE_PERCENT = 100;

export interface SportAdvance {
    /** 6 AM–12 AM. */
    advancePercent: number;
    /** 12 AM–6 AM. */
    nightAdvancePercent: number;
}

type Fallback = Pick<Policies, "advancePercent"> & { nightAdvancePercent?: number | null };

export function isValidAdvancePercent(n: unknown): n is number {
    return typeof n === "number" && Number.isInteger(n) && n >= MIN_ADVANCE_PERCENT && n <= MAX_ADVANCE_PERCENT;
}

export function isNightStart(minutesOfDay: number): boolean {
    return minutesOfDay >= NIGHT_START_MINUTES && minutesOfDay < NIGHT_END_MINUTES;
}

/** The sport's config on this branch, matched by display name (pitches store the name). */
export function sportConfigFor(branch: Pick<Branch, "sportConfigs"> | null | undefined, sport: string): SportConfig | undefined {
    const want = sport.trim().toLowerCase();
    return (branch?.sportConfigs ?? []).find((s) => s.name.trim().toLowerCase() === want || s.id === want);
}

/** A sport's day / night percentages; missing values fall back to the venue-wide policy. */
export function sportAdvance(cfg: Partial<SportAdvance> | null | undefined, fallback: Fallback): SportAdvance {
    const day = isValidAdvancePercent(cfg?.advancePercent) ? cfg.advancePercent : fallback.advancePercent;
    const fbNight = isValidAdvancePercent(fallback.nightAdvancePercent) ? fallback.nightAdvancePercent : 100;
    const night = isValidAdvancePercent(cfg?.nightAdvancePercent) ? cfg.nightAdvancePercent : fbNight;
    return { advancePercent: day, nightAdvancePercent: night };
}

/** The percentage for a booking whose first slot starts at `startMinutes` (Dhaka). */
export function advancePercentAt(adv: SportAdvance, startMinutes: number): number {
    return isNightStart(startMinutes) ? adv.nightAdvancePercent : adv.advancePercent;
}

/**
 * Advance in whole taka. 0% is ৳0 (nothing online). Any other percentage takes at
 * least ৳1 so a low one never rounds a required advance down to nothing, and never
 * more than the total.
 */
export function advanceAmount(total: number, percent: number): number {
    if (!(total > 0) || !(percent > 0)) return 0;
    return Math.min(total, Math.max(1, Math.round((total * percent) / 100)));
}

/** Time windows as shown on admin screens and customer copy. */
export const DAY_WINDOW_LABEL = "6 AM–12 AM";
export const NIGHT_WINDOW_LABEL = "12 AM–6 AM";

function percentText(n: number): string {
    if (n <= 0) return "no advance";
    if (n >= 100) return "100%, the full price";
    return `${n}%`;
}

/**
 * One customer-facing line per active sport, from the live settings, e.g.
 * "Football: 30% (slots starting 12 AM–6 AM: 100%, the full price)", "Table Tennis: no advance".
 */
export function sportAdvanceLines(branch: Pick<Branch, "sportConfigs"> | null | undefined, fallback: Fallback): string[] {
    return (branch?.sportConfigs ?? [])
        .filter((s) => s.active && s.name.trim())
        .map((s) => {
            const adv = sportAdvance(s, fallback);
            const night = adv.nightAdvancePercent !== adv.advancePercent
                ? ` (slots starting ${NIGHT_WINDOW_LABEL}: ${percentText(adv.nightAdvancePercent)})`
                : "";
            return `${s.name}: ${percentText(adv.advancePercent)}${night}`;
        });
}
