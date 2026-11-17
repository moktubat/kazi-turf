// Super Admin customer list. Server-rendered: filters live in the URL (plain GET form), the
// database does the filtering and paging, and nothing here ships extra JavaScript.
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { customerQueryString } from "@/lib/customerFilters";
import { formatBDT, formatDateLong } from "@/lib/format";
import { dhakaParts } from "@/lib/time";
import { BOOKING_STATUSES } from "@/schemas/admin";
import type { CustomerFilters, CustomerRow } from "@/types/customers";

const STATUS_LABEL: Record<string, string> = {
    PENDING_PAYMENT: "Awaiting payment",
    CONFIRMED: "Confirmed",
    CHECKED_IN: "Checked in",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    EXPIRED: "Expired",
};

export const dayOf = (iso: string | null) => (iso ? formatDateLong(dhakaParts(new Date(iso)).date) : "–");

function Breakdown({ s }: { s: CustomerRow["stats"] }) {
    return (
        <span className="block text-xs text-evergreen/70">
            {s.confirmed} confirmed · {s.pending} pending · {s.cancelled} cancelled · {s.expired} expired
        </span>
    );
}

export function CustomerList({
    customers,
    filters,
    next,
}: {
    customers: CustomerRow[];
    filters: CustomerFilters;
    next: string | null;
}) {
    const filtered = !!(filters.q || filters.bookingStatus || filters.from || filters.to);
    return (
        <div className="space-y-5">
            <Card>
                <form method="get" aria-label="Find customers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr_auto] lg:items-end">
                    <Input label="Search" type="search" name="q" defaultValue={filters.q ?? ""} placeholder="Name, phone or email" autoComplete="off" />
                    <Select label="Has a booking that is" name="bookingStatus" defaultValue={filters.bookingStatus ?? ""}>
                        <option value="">Any status</option>
                        {BOOKING_STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                    </Select>
                    <Input label="Booked from" type="date" name="from" defaultValue={filters.from ?? ""} />
                    <Input label="Booked to" type="date" name="to" defaultValue={filters.to ?? ""} />
                    <div className="flex flex-wrap gap-2">
                        <Button type="submit">Apply</Button>
                        {filtered && <Button href="/admin/customers" variant="ghost">Clear</Button>}
                    </div>
                </form>
                <p className="mt-3 text-xs text-evergreen/70">
                    Registered customers, newest first. Dates filter by booking date (Asia/Dhaka).
                </p>
            </Card>

            <p className="text-sm text-evergreen/80" aria-live="polite">
                {customers.length === 0
                    ? ""
                    : `Showing ${customers.length} ${customers.length === 1 ? "customer" : "customers"}${filters.before ? " (older registrations)" : ""}${next ? ". More match these filters." : ""}`}
            </p>

            {customers.length === 0 ? (
                <Card className="flex flex-col items-center gap-3 text-center">
                    <Users size={22} aria-hidden className="text-evergreen/50" />
                    <p className="text-sm text-evergreen/70">
                        {filtered ? "No customers match these filters." : "No customers have registered yet."}
                    </p>
                    {filtered && <Button href="/admin/customers" variant="outline">Clear filters</Button>}
                </Card>
            ) : (
                <>
                    {/* Desktop table */}
                    <div className="scrollbar-thin hidden overflow-x-auto rounded-2xl border border-evergreen/10 bg-surface shadow-sm md:block">
                        <table className="w-full min-w-[56rem] text-left text-sm">
                            <caption className="sr-only">Customers</caption>
                            <thead>
                                <tr className="border-b border-evergreen/10 text-xs uppercase tracking-wide text-evergreen/70">
                                    {["Customer", "Contact", "Bookings", "Paid", "Balance due", "Refunds", "Last booking", "Registered"].map((h) => (
                                        <th key={h} scope="col" className="px-3 py-3 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {customers.map((c) => (
                                    <tr key={c.id} className="border-b border-evergreen/5 align-top transition-colors last:border-0 hover:bg-mint/30">
                                        <th scope="row" className="min-w-36 px-3 py-3">
                                            <Link href={`/admin/customers/view?id=${encodeURIComponent(c.id)}`} className="font-bold text-teal underline underline-offset-2">
                                                {c.name}
                                            </Link>
                                            {c.status === "DISABLED" && <Badge tone="maint" className="ml-2">Disabled</Badge>}
                                        </th>
                                        <td className="min-w-48 px-3 py-3">
                                            {c.phone}
                                            <span className="block break-all text-xs text-evergreen/70">{c.email ?? "No email"}</span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className="font-semibold">{c.stats.bookings}</span>
                                            <Breakdown s={c.stats} />
                                        </td>
                                        <td className="px-3 py-3 font-semibold">{formatBDT(c.stats.paid)}</td>
                                        <td className="px-3 py-3">{c.stats.outstanding > 0 ? <span className="font-semibold text-held">{formatBDT(c.stats.outstanding)}</span> : "–"}</td>
                                        <td className="px-3 py-3">
                                            {c.stats.refunds > 0 ? (
                                                <>
                                                    {c.stats.refunds}
                                                    {c.stats.refundPending > 0 && <span className="block text-xs font-medium text-held">{formatBDT(c.stats.refundPending)} pending</span>}
                                                    {c.stats.refunded > 0 && <span className="block text-xs text-evergreen/70">{formatBDT(c.stats.refunded)} refunded</span>}
                                                </>
                                            ) : "–"}
                                        </td>
                                        <td className="px-3 py-3">{dayOf(c.stats.lastBookingAt)}</td>
                                        <td className="px-3 py-3">{dayOf(c.registeredAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <ul className="space-y-3 md:hidden">
                        {customers.map((c) => (
                            <li key={c.id}>
                                <Link
                                    href={`/admin/customers/view?id=${encodeURIComponent(c.id)}`}
                                    className="flex items-start justify-between gap-3 rounded-2xl border border-evergreen/10 bg-surface p-4 hover:border-teal"
                                >
                                    <span className="min-w-0 space-y-1">
                                        <span className="block break-words font-bold">{c.name}</span>
                                        <span className="block text-sm">{c.phone}</span>
                                        {c.email && <span className="block break-all text-xs text-evergreen/70">{c.email}</span>}
                                        <span className="block text-sm">
                                            {c.stats.bookings} {c.stats.bookings === 1 ? "booking" : "bookings"} · Paid {formatBDT(c.stats.paid)}
                                            {c.stats.outstanding > 0 && <span className="font-semibold text-held">{" "}· Due {formatBDT(c.stats.outstanding)}</span>}
                                        </span>
                                        <span className="block text-xs text-evergreen/70">Last booking {dayOf(c.stats.lastBookingAt)} · Joined {dayOf(c.registeredAt)}</span>
                                    </span>
                                    <ChevronRight size={18} aria-hidden className="mt-1 shrink-0 text-evergreen/50" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {(next || filters.before) && (
                <div className="flex flex-wrap justify-center gap-2">
                    {filters.before && (
                        <Button href={`/admin/customers${customerQueryString(filters)}`} variant="ghost">Back to newest</Button>
                    )}
                    {next && (
                        <Button href={`/admin/customers${customerQueryString(filters, { before: next })}`} variant="outline">
                            Next customers
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
