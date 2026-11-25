"use client";
// A customer's booking and payment history. Rows come from the server (already filtered and
// paged); clicking a booking opens the same booking panel the Bookings page uses.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookingPanel } from "@/components/pages/admin/BookingPanel";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SideSheet } from "@/components/ui/SideSheet";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { formatBDT, formatDateLong, formatTime12 } from "@/lib/format";
import { formatDateTime } from "@/lib/formatAdmin";
import type { CustomerBooking } from "@/types/customers";

function Payments({ b }: { b: CustomerBooking }) {
    if (b.payments.length === 0) return <p className="text-xs text-evergreen/70">No payments recorded.</p>;
    return (
        <ul className="space-y-1 text-xs">
            {b.payments.map((p) => (
                <li key={p.id} className={`flex flex-wrap justify-between gap-x-3 ${p.status === "SUCCESS" ? "" : "text-evergreen/60"}`}>
                    <span className="min-w-0 break-words">
                        {p.kind === "ADVANCE" ? "Advance" : "Balance"} · {p.provider === "CASH" ? "Cash" : "bKash"}
                        {p.status !== "SUCCESS" && <span className="font-semibold"> · {p.status === "PENDING" ? "Pending" : p.status === "VOIDED" ? "Reversed (not received)" : "Failed"}</span>}
                        {p.reference && <span className="font-mono"> {p.reference}</span>} · {formatDateTime(p.at)}
                    </span>
                    <span className="shrink-0 font-semibold">{formatBDT(p.amount)}</span>
                </li>
            ))}
        </ul>
    );
}

export function CustomerBookings({ bookings }: { bookings: CustomerBooking[] }) {
    const router = useRouter();
    const [open, setOpen] = useState<string | null>(null);

    if (bookings.length === 0) {
        return (
            <Card>
                <p className="text-sm text-evergreen/70">No bookings to show.</p>
            </Card>
        );
    }

    return (
        <>
            <ul className="space-y-3">
                {bookings.map((b) => (
                    <li key={b.code} className="space-y-3 rounded-2xl border border-evergreen/10 bg-surface p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                                <button
                                    type="button"
                                    onClick={() => setOpen(b.code)}
                                    className="min-h-11 font-mono font-bold text-teal underline underline-offset-2"
                                    aria-label={`Open booking ${b.code}`}
                                >
                                    {b.code}
                                </button>
                                <p className="text-sm">
                                    {formatDateLong(b.date)} · {formatTime12(b.start)}–{formatTime12(b.end)}
                                </p>
                                <p className="text-sm text-evergreen/80">
                                    {b.pitchName}
                                    {b.sport && ` · ${b.sport}`} · Booked {formatDateTime(b.createdAt)}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <BookingStatusBadge status={b.bookingStatus} />
                                <PaymentStatusBadge status={b.paymentStatus} paid={b.paid} />
                                <Badge tone={b.source === "counter" ? "info" : "neutral"}>{b.source === "counter" ? "Counter" : "Online"}</Badge>
                            </div>
                        </div>
                        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-mint p-3 text-sm">
                            <div>
                                <dt className="text-xs text-evergreen/70">Total</dt>
                                <dd className="font-semibold">{formatBDT(b.total)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-evergreen/70">Paid</dt>
                                <dd className="font-semibold">{formatBDT(b.paid)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-evergreen/70">Balance due</dt>
                                <dd className={`font-semibold ${b.balanceDue > 0 ? "text-booked" : ""}`}>{formatBDT(b.balanceDue)}</dd>
                            </div>
                        </dl>
                        <div>
                            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-evergreen/60">Payments</h3>
                            <Payments b={b} />
                        </div>
                    </li>
                ))}
            </ul>

            <SideSheet open={!!open} onClose={() => setOpen(null)} title="Booking">
                {open && <BookingPanel key={open} code={open} role="SUPER_ADMIN" onChanged={() => router.refresh()} />}
            </SideSheet>
        </>
    );
}
