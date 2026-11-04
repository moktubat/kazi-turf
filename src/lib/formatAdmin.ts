import { site } from "@/data/site";

/** ISO timestamp → "4 Nov, 7:30 PM" (Asia/Dhaka, 12-hour). */
export function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: site.timezone,
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(new Date(iso));
}