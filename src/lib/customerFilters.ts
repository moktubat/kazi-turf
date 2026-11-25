// Customer list / history filters from the URL (?q=&bookingStatus=&from=&to=&page=).
// Pure, shared by the pages and tests. Anything malformed is ignored, never an error.
import { BOOKING_STATUSES } from "@/schemas/admin";
import type { BookingStatus } from "@/types";
import type { CustomerFilters } from "@/types/customers";

type Query = Record<string, string | string[] | undefined>;
const one = (sp: Query, k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
};
const isDate = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Booking-history cursor on the customer page ("<ISO time>|<booking code>"). */
const CURSOR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z\|[A-Za-z0-9_-]{1,80}$/;

export function customerFiltersFromQuery(sp: Query): CustomerFilters {
    const f: CustomerFilters = {};
    const q = one(sp, "q")?.trim().slice(0, 60);
    if (q) f.q = q;
    const s = one(sp, "bookingStatus");
    if ((BOOKING_STATUSES as readonly string[]).includes(s ?? "")) f.bookingStatus = s as BookingStatus;
    const from = one(sp, "from");
    const to = one(sp, "to");
    if (isDate(from)) f.from = from;
    if (isDate(to)) f.to = to;
    const page = Number.parseInt(one(sp, "page") ?? "1", 10);
    if (Number.isFinite(page) && page > 1) f.page = page;
    // The customer page's "Older bookings" pager (one customer's history) uses a cursor.
    const before = one(sp, "before");
    if (before && CURSOR.test(before)) f.before = before;
    return f;
}

/** The same filters as a query string (for pagination links and the booking history pager). */
export function customerQueryString(f: CustomerFilters, extra: Record<string, string | undefined> = {}): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
        q: f.q,
        bookingStatus: f.bookingStatus,
        from: f.from,
        to: f.to,
        page: f.page && f.page > 1 ? String(f.page) : undefined,
        ...extra,
    })) {
        if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
}