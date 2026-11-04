import { site } from "@/data/site";

const bdt = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 });

export function formatBDT(amount: unknown): string {
    const n = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(n)) return "৳—";
    return `৳${bdt.format(n)}`;
}

export function isPayableAmount(amount: unknown): amount is number {
    return typeof amount === "number" && Number.isFinite(amount) && amount > 0;
}

/** Date/ISO → "7:30 PM" (12-hour, Asia/Dhaka). */
export function formatTime(d: Date | string): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: site.timezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(typeof d === "string" ? new Date(d) : d);
}

/** "HH:MM" string → "h:MM AM/PM". Handles "24:00" as 12:00 AM (end of day). */
export function formatTime12(time: string): string {
    if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return time ?? "";
    const [h, m] = time.split(":").map(Number);
    if (h === 24) return `12:${String(m).padStart(2, "0")} AM`;
    const period = h < 12 ? "AM" : "PM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "06:00 – 24:00" → "6:00 AM – 12:00 AM". Accepts –, — or -. */
export function formatHourRange(range: string): string {
    if (!range) return range;
    return range
        .split(/[–—-]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(formatTime12)
        .join(" – ");
}

export function formatDateLong(date: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(`${date}T00:00:00Z`));
}

export function formatDateShort(date: string): { weekday: string; day: string; month: string } {
    const d = new Date(`${date}T00:00:00Z`);
    const f = (o: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(d);
    return { weekday: f({ weekday: "short" }), day: f({ day: "numeric" }), month: f({ month: "short" }) };
}