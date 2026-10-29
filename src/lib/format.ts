import { site } from "@/data/site";

const bdt = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 });

export function formatBDT(amount: number): string {
    return `৳${bdt.format(amount)}`;
}

export function formatTime(d: Date | string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: site.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(typeof d === "string" ? new Date(d) : d);
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