import { connection } from "next/server";

// Asia/Dhaka is a fixed UTC+6 (no DST). Timestamps are stored/handled in UTC.
const OFFSET_MS = 6 * 60 * 60 * 1000;

export function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}

export function toHHMM(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" + minutes-from-midnight (Dhaka) → UTC Date */
export function dhakaToUtc(date: string, minutes: number): Date {
    const [y, mo, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, mo - 1, d, 0, minutes) - OFFSET_MS);
}

/** UTC Date → Dhaka calendar parts */
export function dhakaParts(d: Date) {
    const shifted = new Date(d.getTime() + OFFSET_MS);
    return {
        date: shifted.toISOString().slice(0, 10),
        minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
        dow: shifted.getUTCDay(),
    };
}

/**
 * Returns today's date in Asia/Dhaka as "YYYY-MM-DD".
 * When no `now` is supplied the function opts into request-time evaluation
 * (required by Cache Components).
 */
export async function todayDhaka(now?: Date): Promise<string> {
    if (!now) {
        await connection(); // marks everything after this as request-time
        now = new Date();
    }
    return dhakaParts(now).date;
}

/**
 * Add (or subtract) days from a "YYYY-MM-DD" string or a Date.
 * Throws a clear TypeError on bad input so the real call site is obvious.
 */
export function addDays(date: string | Date, n: number): string {
    let iso: string;

    if (typeof date === "string") {
        iso = date.slice(0, 10);
    } else if (date instanceof Date && !Number.isNaN(date.getTime())) {
        iso = date.toISOString().slice(0, 10);
    } else {
        throw new TypeError(
            `addDays expected YYYY-MM-DD string or Date, got ${Object.prototype.toString.call(date)}: ${String(date)}`
        );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        throw new TypeError(`addDays: invalid date string "${iso}"`);
    }

    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}