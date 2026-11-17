// Bookings list filters carried in the URL (/admin/bookings?…), so other screens such as
// Needs Attention can link straight to a filtered list. Pure: shared by the page and tests.
import { BOOKING_STATUSES, PAYMENT_STATUSES } from "@/schemas/admin";
import { addDays } from "@/lib/time";
import type { BookingStatus, PaymentStatus } from "@/types";

export interface BookingListFilters {
    from: string; // "" = no lower date bound
    to: string; // "" = no upper date bound
    bookingStatus: BookingStatus | "";
    paymentStatus: PaymentStatus | "";
    requestOnly: boolean;
}

type Query = Record<string, string | string[] | undefined>;

const one = (sp: Query, k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
};
const isDate = (v?: string): v is string =>
    !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** What "Clear filters" goes back to: last 7 days to 30 days ahead, everything else off. */
export function defaultBookingFilters(today: string): BookingListFilters {
    return { from: addDays(today, -7), to: addDays(today, 30), bookingStatus: "", paymentStatus: "", requestOnly: false };
}

/**
 * Filters the page opens with. Unknown or malformed values are ignored (never an error).
 *  request=open  open customer requests, last 90 days onwards (as before)
 *  range=all     no date bounds
 *  from, to      explicit dates (override the above)
 *  bookingStatus, paymentStatus  one of the known statuses
 */
export function bookingFiltersFromQuery(sp: Query, today: string): BookingListFilters {
    const f = defaultBookingFilters(today);
    if (one(sp, "request") === "open") {
        f.requestOnly = true;
        f.from = addDays(today, -90);
    }
    if (one(sp, "range") === "all") {
        f.from = "";
        f.to = "";
    }
    const from = one(sp, "from");
    const to = one(sp, "to");
    if (isDate(from)) f.from = from;
    if (isDate(to)) f.to = to;
    const bs = one(sp, "bookingStatus");
    const ps = one(sp, "paymentStatus");
    if ((BOOKING_STATUSES as readonly string[]).includes(bs ?? "")) f.bookingStatus = bs as BookingStatus;
    if ((PAYMENT_STATUSES as readonly string[]).includes(ps ?? "")) f.paymentStatus = ps as PaymentStatus;
    return f;
}

/** Link to the Bookings list with these filters (only the ones given). */
export function bookingsHref(f: { range?: "all"; from?: string; to?: string; bookingStatus?: BookingStatus; paymentStatus?: PaymentStatus }) {
    const p = new URLSearchParams();
    if (f.paymentStatus) p.set("paymentStatus", f.paymentStatus);
    if (f.bookingStatus) p.set("bookingStatus", f.bookingStatus);
    if (f.range) p.set("range", f.range);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    return `/admin/bookings?${p.toString()}`;
}
