// Slot-grid helpers shared by forms (client) and Setup validation (server).
import { toMinutes } from "@/lib/time";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Like toHHMM, but 1440 reads "24:00" (end of day). */
export function boundaryLabel(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Every slot boundary from open to close: 06:00, 07:30, ... 24:00. */
export function gridBoundaries(open: string, close: string, step: number): string[] {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (c <= o || (c - o) % step !== 0) return [];
    const out: string[] = [];
    for (let m = o; m <= c; m += step) out.push(boundaryLabel(m));
    return out;
}

/** Valid closing times for a given opening time (whole slots, up to 24:00). */
export function closeOptions(open: string, step: number): string[] {
    const out: string[] = [];
    for (let m = toMinutes(open) + step; m <= 1440; m += step) out.push(boundaryLabel(m));
    return out;
}

export function daysLabel(days: number[]): string {
    const d = [...new Set(days)].sort((a, b) => a - b);
    if (d.length === 7) return "Every day";
    if (d.length === 1) return DAY_NAMES[d[0]];
    const contiguous = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
    return contiguous ? `${DAY_NAMES[d[0]]}–${DAY_NAMES[d[d.length - 1]]}` : d.map((x) => DAY_NAMES[x]).join(", ");
}