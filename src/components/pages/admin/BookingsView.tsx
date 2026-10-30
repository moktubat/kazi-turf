"use client";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { ApiError, api, isAbort } from "@/lib/api";
import { formatBDT, formatDateLong } from "@/lib/format";
import type { Role } from "@/types";
import type { AdminBookingDto } from "@/types/admin";
import { BookingPanel } from "./BookingPanel";

const BOOKING = [
    ["PENDING_PAYMENT", "Awaiting payment"],
    ["CONFIRMED", "Confirmed"],
    ["CHECKED_IN", "Checked in"],
    ["COMPLETED", "Completed"],
    ["CANCELLED", "Cancelled"],
    ["EXPIRED", "Expired"],
] as const;

const PAYMENT = [
    ["NOT_STARTED", "Not paid"],
    ["PENDING", "Processing"],
    ["PARTIALLY_PAID", "Advance paid"],
    ["PAID", "Fully paid"],
    ["FAILED", "Failed"],
    ["CANCELLED", "Payment cancelled"],
    ["REFUND_PENDING", "Refund pending"],
    ["REFUNDED", "Refunded"],
] as const;

export function BookingsView({
    branches,
    role,
    defaults,
}: {
    branches: { id: string; name: string }[];
    role: Role;
    defaults: { from: string; to: string; requestOnly: boolean };
}) {
    const [from, setFrom] = useState(defaults.from);
    const [to, setTo] = useState(defaults.to);
    const [branch, setBranch] = useState("");
    const [bookingStatus, setBookingStatus] = useState("");
    const [paymentStatus, setPaymentStatus] = useState("");
    const [source, setSource] = useState("");
    const [q, setQ] = useState("");
    const [requestOnly, setRequestOnly] = useState(defaults.requestOnly);

    const [rows, setRows] = useState<AdminBookingDto[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [openCode, setOpenCode] = useState<string | null>(null);
    const [reload, setReload] = useState(0);

    const params = useMemo(() => {
        const p = new URLSearchParams();
        if (from) p.set("from", from);
        if (to) p.set("to", to);
        if (branch) p.set("branch", branch);
        if (bookingStatus) p.set("bookingStatus", bookingStatus);
        if (paymentStatus) p.set("paymentStatus", paymentStatus);
        if (source) p.set("source", source);
        if (q.trim().length >= 3) p.set("q", q.trim());
        if (requestOnly) p.set("request", "open");
        return p.toString();
    }, [from, to, branch, bookingStatus, paymentStatus, source, q, requestOnly]);

    useEffect(() => {
        const ctrl = new AbortController();
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const r = await api<{ bookings: AdminBookingDto[] }>(`/api/admin/bookings?${params}`, { signal: ctrl.signal });
                setRows(r.bookings);
                setError(null);
            } catch (e) {
                if (isAbort(e)) return;
                setError(e instanceof ApiError ? e.message : "Could not load bookings.");
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [params, reload]);

    function clear() {
        setFrom(defaults.from);
        setTo(defaults.to);
        setBranch("");
        setBookingStatus("");
        setPaymentStatus("");
        setSource("");
        setQ("");
        setRequestOnly(false);
    }

    const sourceBadge = (s: AdminBookingDto["source"]) => (
        <Badge tone={s === "counter" ? "info" : "neutral"}>{s === "counter" ? "Counter" : "Online"}</Badge>
    );

    return (
        <div className="space-y-5">
            <Card className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    <Select label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                        <option value="">{branches.length > 1 ? "All my branches" : branches[0]?.name}</option>
                        {branches.length > 1 && branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                    <Select label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
                        <option value="">Online and counter</option>
                        <option value="online">Online</option>
                        <option value="counter">Counter</option>
                    </Select>
                    <Select label="Booking status" value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value)}>
                        <option value="">All (except expired)</option>
                        {BOOKING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                    <Select label="Payment status" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                        <option value="">All</option>
                        {PAYMENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                    <div className="sm:col-span-2">
                        <Input label="Search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, phone or name" hint="Type at least 3 characters." />
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                        <input type="checkbox" className="size-5 accent-teal" checked={requestOnly} onChange={(e) => setRequestOnly(e.target.checked)} />
                        Only bookings with an open customer request
                    </label>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={clear}>Clear filters</Button>
                        {role === "SUPER_ADMIN" && (
                            <a
                                href={`/api/admin/bookings/export?${params}`}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-teal px-4 font-heading text-sm font-semibold text-teal hover:bg-mint"
                            >
                                <Download size={18} aria-hidden /> Export CSV
                            </a>
                        )}
                    </div>
                </div>
            </Card>

            <p className="text-sm text-evergreen/80" aria-live="polite">
                {loading ? "Loading…" : rows ? `${rows.length} ${rows.length === 1 ? "booking" : "bookings"}${rows.length >= 100 ? " (showing the first 100, narrow the filters)" : ""}` : ""}
            </p>

            {error && <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{error}</p>}

            {rows && rows.length === 0 && !loading && (
                <Card className="text-center"><p className="font-semibold">No bookings match these filters.</p></Card>
            )}

            {rows && rows.length > 0 && (
                <>
                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto rounded-2xl border border-evergreen/10 bg-white md:block">
                        <table className="w-full text-left text-sm">
                            <caption className="sr-only">Bookings</caption>
                            <thead>
                                <tr className="border-b border-evergreen/10 text-xs uppercase tracking-wide text-evergreen/70">
                                    {["Code", "When", "Customer", "Pitch", "Status", "Total", "Source"].map((h) => (
                                        <th key={h} scope="col" className="px-3 py-3 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((b) => (
                                    <tr key={b.code} className="border-b border-evergreen/5 align-top last:border-0">
                                        <th scope="row" className="px-3 py-3">
                                            <button type="button" onClick={() => setOpenCode(b.code)} className="min-h-11 font-mono font-bold text-teal underline underline-offset-2">
                                                {b.code}
                                            </button>
                                        </th>
                                        <td className="px-3 py-3">{formatDateLong(b.date)}<span className="block text-xs text-evergreen/70">{b.start}–{b.end}</span></td>
                                        <td className="px-3 py-3">{b.customerName}<span className="block text-xs text-evergreen/70">{b.phone}</span></td>
                                        <td className="px-3 py-3">{b.branchName}<span className="block text-xs text-evergreen/70">{b.pitchName}</span></td>
                                        <td className="px-3 py-3">
                                            <div className="flex flex-col items-start gap-1.5">
                                                <BookingStatusBadge status={b.bookingStatus} />
                                                <PaymentStatusBadge status={b.paymentStatus} />
                                                {b.changeRequest && <Badge tone="held">Request open</Badge>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 font-semibold">
                                            {formatBDT(b.total)}
                                            {b.balanceDue > 0 && <span className="block text-xs font-medium text-held">Due {formatBDT(b.balanceDue)}</span>}
                                        </td>
                                        <td className="px-3 py-3">{sourceBadge(b.source)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <ul className="space-y-3 md:hidden">
                        {rows.map((b) => (
                            <li key={b.code}>
                                <button
                                    type="button"
                                    onClick={() => setOpenCode(b.code)}
                                    aria-label={`Open booking ${b.code}, ${b.customerName}`}
                                    className="w-full space-y-2 rounded-2xl border border-evergreen/10 bg-white p-4 text-left hover:border-teal"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono font-bold">{b.code}</span>
                                        {sourceBadge(b.source)}
                                    </div>
                                    <p className="text-sm">{b.customerName} · {b.phone}</p>
                                    <p className="text-sm text-evergreen/80">{formatDateLong(b.date)} · {b.start}–{b.end} · {b.pitchName}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <BookingStatusBadge status={b.bookingStatus} />
                                        <PaymentStatusBadge status={b.paymentStatus} />
                                        {b.changeRequest && <Badge tone="held">Request open</Badge>}
                                    </div>
                                    <p className="text-sm font-semibold">
                                        {formatBDT(b.total)}
                                        {b.balanceDue > 0 && <span className="ml-2 font-medium text-held">Due {formatBDT(b.balanceDue)}</span>}
                                    </p>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <SideSheet open={!!openCode} onClose={() => setOpenCode(null)} title="Booking">
                {openCode && <BookingPanel code={openCode} role={role} onChanged={() => setReload((n) => n + 1)} />}
            </SideSheet>
        </div>
    );
}