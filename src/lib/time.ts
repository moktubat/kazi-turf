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

/** "YYYY-MM-DD" + minutes-from-midnight (Dhaka) -> UTC Date */
export function dhakaToUtc(date: string, minutes: number): Date {
    const [y, mo, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, mo - 1, d, 0, minutes) - OFFSET_MS);
}

/** UTC Date -> Dhaka calendar parts */
export function dhakaParts(d: Date) {
    const shifted = new Date(d.getTime() + OFFSET_MS);
    return {
        date: shifted.toISOString().slice(0, 10),
        minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
        dow: shifted.getUTCDay(),
    };
}

// Fix: Make 'now' optional and evaluate new Date() inside the function body
export function todayDhaka(now?: Date): string {
    return dhakaParts(now ?? new Date()).date;
}

export function addDays(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}