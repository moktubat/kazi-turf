import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Banknote, CalendarCheck, Hourglass, Mail, Phone, RotateCcw } from "lucide-react";
import { CustomerBookings } from "@/components/pages/admin/customers/CustomerBookings";
import { dayOf } from "@/components/pages/admin/customers/CustomerList";
import { Kpi } from "@/components/pages/admin/insights/Charts";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { customerFiltersFromQuery, customerQueryString } from "@/lib/customerFilters";
import { formatBDT } from "@/lib/format";
import { getCustomerDetail } from "@/server/admin/customers";
import { requireAdminPage } from "@/server/auth/pageGuards";
import { AppError } from "@/server/http";
import CustomerLoading from "./loading";

export const metadata: Metadata = { title: "Customer" };

// A fixed path with ?id=… (not /customers/[id]): a dynamic path segment would make the root
// layout's pathname-aware parts need their own Suspense boundaries.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_FILTERS = [
    ["", "All"],
    ["CONFIRMED", "Confirmed"],
    ["COMPLETED", "Completed"],
    ["PENDING_PAYMENT", "Awaiting payment"],
    ["CANCELLED", "Cancelled"],
    ["EXPIRED", "Expired"],
] as const;

async function CustomerContent({ searchParams }: Props) {
    const sp = await searchParams;
    const id = (Array.isArray(sp.id) ? sp.id[0] : sp.id) ?? "";
    const user = await requireAdminPage(`/admin/customers/view?id=${encodeURIComponent(id)}`);
    const f = customerFiltersFromQuery(sp);
    let data;
    try {
        data = await getCustomerDetail(user, id, { before: f.before, bookingStatus: f.bookingStatus });
    } catch (e) {
        if (e instanceof AppError && e.status === 404) notFound();
        throw e;
    }
    const { customer: c, bookings, next } = data;
    const s = c.stats;
    const base = "/admin/customers/view";

    return (
        <>
            <div className="space-y-1">
                <h1 className="break-words text-2xl font-extrabold md:text-3xl">{c.name}</h1>
                <p className="text-sm text-evergreen/70">
                    Customer since {dayOf(c.registeredAt)} · Last booking {dayOf(s.lastBookingAt)}
                    {c.status === "DISABLED" && <Badge tone="maint" className="ml-2">Account disabled</Badge>}
                </p>
            </div>

            <Card className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center gap-2 text-teal underline underline-offset-2">
                    <Phone size={16} aria-hidden /> {c.phone}
                </a>
                {c.email ? (
                    <span className="inline-flex min-h-11 min-w-0 items-center gap-2">
                        <Mail size={16} aria-hidden className="shrink-0 text-teal" />
                        <a href={`mailto:${c.email}`} className="break-all text-teal underline underline-offset-2">{c.email}</a>
                        <Badge tone={c.emailVerified ? "success" : "neutral"}>{c.emailVerified ? "Verified" : "Not verified"}</Badge>
                    </span>
                ) : (
                    <span className="inline-flex min-h-11 items-center text-evergreen/70">No email on file</span>
                )}
            </Card>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={CalendarCheck} label="Bookings" value={String(s.bookings)} sub={`${s.confirmed} confirmed · ${s.pending} pending · ${s.cancelled} cancelled · ${s.expired} expired`} />
                <Kpi icon={Banknote} label="Paid" value={formatBDT(s.paid)} sub="Cash and bKash received" />
                <Kpi icon={Hourglass} label="Balance due" value={formatBDT(s.outstanding)} sub="Still to pay at the venue" />
                <Kpi
                    icon={RotateCcw}
                    label="Refunds"
                    value={String(s.refunds)}
                    sub={`${formatBDT(s.refundPending)} pending · ${formatBDT(s.refunded)} refunded (amounts received on those bookings)`}
                />
            </div>

            <section aria-labelledby="history-title" className="space-y-3">
                <h2 id="history-title" className="text-xl font-bold">Bookings and payments</h2>
                <nav aria-label="Filter bookings" className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
                    {STATUS_FILTERS.map(([v, label]) => {
                        const on = (f.bookingStatus ?? "") === v;
                        return (
                            <Link
                                key={v || "all"}
                                href={`${base}${customerQueryString({ bookingStatus: v || undefined }, { id: c.id })}`}
                                aria-current={on ? "page" : undefined}
                                className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${on ? "border-teal bg-mint text-teal" : "border-evergreen/15 text-evergreen/80 hover:border-teal"}`}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </nav>
                <Suspense fallback={null}>
                    <CustomerBookings bookings={bookings} />
                </Suspense>
                {(next || f.before) && (
                    <div className="flex flex-wrap justify-center gap-2">
                        {f.before && <Button href={`${base}${customerQueryString({ bookingStatus: f.bookingStatus }, { id: c.id })}`} variant="ghost">Newest bookings</Button>}
                        {next && <Button href={`${base}${customerQueryString({ bookingStatus: f.bookingStatus }, { id: c.id, before: next })}`} variant="outline">Older bookings</Button>}
                    </div>
                )}
            </section>
        </>
    );
}

export default function CustomerPage(props: Props) {
    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <Link href="/admin/customers" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-teal underline underline-offset-2">
                <ArrowLeft size={16} aria-hidden /> All customers
            </Link>
            <Suspense fallback={<CustomerLoading bare />}>
                <CustomerContent {...props} />
            </Suspense>
        </div>
    );
}
