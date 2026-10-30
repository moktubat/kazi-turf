// Convenience link only. It never changes the booking record.
export function googleCalendarUrl(p: {
    title: string;
    startAt: string;
    endAt: string;
    location: string;
    details: string;
}): string {
    const fmt = (iso: string) =>
        new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const q = new URLSearchParams({
        action: "TEMPLATE",
        text: p.title,
        dates: `${fmt(p.startAt)}/${fmt(p.endAt)}`,
        details: p.details,
        location: p.location,
        ctz: "Asia/Dhaka",
    });
    return `https://calendar.google.com/calendar/render?${q.toString()}`;
}