import { site } from "@/data/site";

export function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: site.timezone,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(iso));
}