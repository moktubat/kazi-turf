// Shared booking drawer content: used by the Staff Desk and /admin/bookings.
"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Banknote, Check, CheckCircle2, History, LogIn, Phone, Printer, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { actionSuccessMessage, type BookingAction } from "@/lib/adminMessages";
import { ApiError, api, isAbort } from "@/lib/api";
import { formatBDT, formatDateLong, formatDiscount, formatTime12 } from "@/lib/format";
import { formatDateTime } from "@/lib/formatAdmin";
import { hasVerifiedPayment, printReceipt } from "@/lib/printReceipt";
import type { Role } from "@/types";
import type { AdminBookingDto, AuditEntryDto } from "@/types/admin";
import { CancelForm, CheckInForm, CollectForm, RefundForm } from "./ActionForms";

type Mode = null | "checkin" | "collect" | "cancel" | "refund";
type State =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; booking: AdminBookingDto; audit: AuditEntryDto[] };

const chip = {
    VALID: { cls: "bg-emerald/25 text-evergreen", Icon: Check },
    OUTSIDE_WINDOW: { cls: "bg-held-soft text-held", Icon: AlertTriangle },
    BLOCKED: { cls: "bg-booked-soft text-booked", Icon: XCircle },
} as const;

function Line({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
    return (
        <div className={`flex items-baseline justify-between gap-4 ${strong ? "font-bold" : ""}`}>
            <dt className={strong ? "shrink-0" : "shrink-0 text-evergreen/80"}>{label}</dt>
            <dd className="min-w-0 break-words text-right font-semibold">{value}</dd>
        </div>
    );
}

export function BookingPanel({
    code,
    onChanged,
}: {
    code: string;
    role: Role;
    onChanged: () => void;
}) {
    const [state, setState] = useState<State>({ kind: "loading" });
    const [mode, setMode] = useState<Mode>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Every caller renders this with key={code}, so a different booking gets a fresh panel
    // (loading state, no open form, no old error or confirmation) without resetting state here.
    // The request: resolves to the next state, or null when aborted. It never sets state itself.
    const request = useCallback(
        (signal?: AbortSignal): Promise<State | null> =>
            api<{ booking: AdminBookingDto; audit: AuditEntryDto[] }>(`/api/admin/bookings/${encodeURIComponent(code)}`, { signal }).then(
                (r): State => ({ kind: "ready", booking: r.booking, audit: r.audit }),
                (e): State | null =>
                    isAbort(e) // panel closed or replaced: drop the stale response
                        ? null
                        : { kind: "error", message: e instanceof ApiError ? e.message : "Could not load this booking." }
            ),
        [code]
    );

    /** Reload after an action, or "Try again". */
    const load = useCallback(async () => {
        const next = await request();
        if (next) setState(next);
    }, [request]);

    useEffect(() => {
        const ctrl = new AbortController();
        request(ctrl.signal).then((next) => {
            if (next) setState(next);
        });
        return () => ctrl.abort();
    }, [request]);

    async function run(path: BookingAction, body?: unknown) {
        setBusy(true);
        setActionError(null);
        setNotice(null);
        try {
            await api(`/api/admin/bookings/${encodeURIComponent(code)}/${path}`, {
                method: "POST",
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            setMode(null);
            await load();
            setNotice(actionSuccessMessage(path));
            onChanged();
        } catch (e) {
            if (e instanceof ApiError) {
                setActionError(e.fields ? (Object.values(e.fields)[0] ?? e.message) : e.message);
                // A stale screen (already cancelled, already checked in): refresh so it shows the truth.
                if (e.status === 409) {
                    await load();
                    onChanged();
                }
            } else setActionError("Something went wrong. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    if (state.kind === "loading") {
        return (
            <div role="status" aria-busy aria-label="Loading booking" className="space-y-3">
                <div className="h-8 w-1/2 animate-pulse rounded bg-evergreen/10" />
                <div className="h-40 animate-pulse rounded-2xl bg-evergreen/10" />
            </div>
        );
    }
    if (state.kind === "error") {
        return (
            <div className="space-y-3">
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                    <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /> {state.message}
                </p>
                <Button onClick={() => load()}>Try again</Button>
            </div>
        );
    }

    const { booking: b, audit } = state;
    const c = chip[b.checkIn.state];
    const formProps = { b, busy, onBack: () => { setMode(null); setActionError(null); } };
    const open = (m: Exclude<Mode, null>) => {
        setNotice(null);
        setMode(m);
    };

    return (
        <div className="space-y-5">
            <div className="space-y-3 rounded-2xl bg-evergreen p-5 text-center text-white">
                <p className="break-all font-mono text-3xl font-extrabold tracking-widest" aria-label={`Booking code ${b.code}`}>{b.code}</p>
                <div className="mx-auto flex w-fit flex-wrap items-center justify-center gap-2 rounded-xl bg-surface px-3 py-2">
                    <BookingStatusBadge status={b.bookingStatus} />
                    <PaymentStatusBadge status={b.paymentStatus} paid={b.advancePaid} />
                    <Badge tone={b.source === "counter" ? "info" : "neutral"}>{b.source === "counter" ? "Counter" : "Online"}</Badge>
                </div>
            </div>

            <p className={`flex items-start gap-2 rounded-xl p-3 text-sm font-semibold ${c.cls}`}>
                <c.Icon size={18} aria-hidden className="mt-0.5 shrink-0" /> {b.checkIn.message}
            </p>

            {b.changeRequest && (
                <div className="space-y-2 rounded-xl bg-held-soft p-3 text-sm text-held">
                    <p className="font-bold">
                        Customer asked to {b.changeRequest.kind === "CANCEL" ? "cancel" : "reschedule"} · {formatDateTime(b.changeRequest.createdAt)}
                    </p>
                    <p>{b.changeRequest.reason}</p>
                    <Button variant="outline" disabled={busy} onClick={() => run("request")}>
                        Mark request handled
                    </Button>
                </div>
            )}

            <dl className="space-y-1.5 text-sm">
                <Line label="Customer" value={b.customerName} />
                <Line
                    label="Phone"
                    value={
                        <a href={`tel:${b.phone}`} className="inline-flex items-center gap-1 text-teal underline underline-offset-2">
                            <Phone size={14} aria-hidden /> {b.phone}
                        </a>
                    }
                />
                <Line label="Field" value={`${b.pitchName} · ${b.sport}`} />
                <Line label="Date" value={formatDateLong(b.date)} />
                <Line label="Time" value={`${formatTime12(b.start)}–${formatTime12(b.end)}`} />
            </dl>

            <dl className="space-y-1.5 rounded-xl bg-mint p-3 text-sm">
                <Line label="Subtotal" value={formatBDT(b.subtotal)} />
                <Line label="Discount" value={formatDiscount(b.discountAmount)} />
                {b.vatRatePercent && b.vatAmount > 0 && (
                    <Line label={b.total === b.subtotal - b.discountAmount ? `Includes VAT (${b.vatRatePercent}%)` : `VAT (${b.vatRatePercent}%)`} value={formatBDT(b.vatAmount)} />
                )}
                <Line label="Total" value={formatBDT(b.total)} strong />
                <Line label="Paid so far" value={formatBDT(b.payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0))} />
                <Line label="Balance due" value={formatBDT(b.balanceDue)} strong />
            </dl>

            {b.payments.length > 0 && (
                <div>
                    <h3 className="mb-1.5 text-sm font-bold">Payments</h3>
                    <ul className="space-y-1 text-sm">
                        {b.payments.map((p) => (
                            <li key={p.id} className={`flex justify-between gap-4 ${p.status === "SUCCESS" ? "" : "text-evergreen/60"}`}>
                                <span className="min-w-0 break-words">
                                    {p.kind === "ADVANCE" ? "Advance" : "Balance"} · {p.provider === "CASH" ? "Cash" : "bKash"}
                                    {/* Only successful payments count towards "Paid so far". */}
                                    {p.status !== "SUCCESS" && <span className="text-xs font-semibold"> · {p.status === "PENDING" ? "Pending" : "Failed"}</span>}
                                    {p.reference && <span className="font-mono text-xs"> {p.reference}</span>}
                                    <span className="block text-xs text-evergreen/70">{formatDateTime(p.at)}</span>
                                </span>
                                <span className="shrink-0 font-semibold">{formatBDT(p.amount)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {b.note && (
                <p className="rounded-xl bg-mint p-3 text-sm">
                    <span className="font-semibold">Note:</span> <span className="break-words">{b.note}</span>
                </p>
            )}

            {b.cancelReason && (
                <p className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">Cancelled: {b.cancelReason}</p>
            )}

            {notice && (
                <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
                    <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" /> {notice}
                </p>
            )}

            {actionError && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                    <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /> {actionError}
                </p>
            )}

            {mode === null && (
                <div className="flex flex-col gap-2">
                    {(b.can.checkIn || b.can.overrideCheckIn) && (
                        <Button size="lg" onClick={() => open("checkin")}>
                            <LogIn size={18} aria-hidden /> {b.can.overrideCheckIn ? "Override check-in" : "Check in"}
                        </Button>
                    )}
                    {b.can.collectBalance && (
                        <Button size="lg" variant="secondary" onClick={() => open("collect")}>
                            <Banknote size={18} aria-hidden /> Collect balance (cash {formatBDT(b.balanceDue)})
                        </Button>
                    )}
                    {hasVerifiedPayment(b) && (
                        <Button variant="outline" onClick={() => printReceipt(b)}>
                            <Printer size={18} aria-hidden /> Print receipt
                        </Button>
                    )}
                    {b.can.refund && (
                        <Button variant="outline" onClick={() => open("refund")}>
                            <RotateCcw size={18} aria-hidden /> Record refund
                        </Button>
                    )}
                    {b.can.cancel && (
                        <Button variant="ghost" className="text-booked" onClick={() => open("cancel")}>
                            <XCircle size={18} aria-hidden /> Cancel booking
                        </Button>
                    )}
                </div>
            )}
            {mode === "checkin" && <CheckInForm {...formProps} onSubmit={(body) => run("check-in", body)} />}
            {mode === "collect" && <CollectForm {...formProps} onSubmit={() => run("collect-balance")} />}
            {mode === "cancel" && <CancelForm {...formProps} onSubmit={(body) => run("cancel", body)} />}
            {mode === "refund" && <RefundForm {...formProps} onSubmit={(body) => run("refund", body)} />}

            <details className="rounded-xl border border-evergreen/10 p-3 text-sm">
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
                    <History size={16} aria-hidden /> Audit trail ({audit.length})
                </summary>
                {audit.length === 0 ? (
                    <p className="mt-2 text-evergreen/70">No staff actions yet.</p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {audit.map((a) => (
                            <li key={a.id}>
                                <p className="font-semibold">{a.action.replace(/_/g, " ").toLowerCase()}</p>
                                <p className="text-xs text-evergreen/70">
                                    {a.actorName} · {formatDateTime(a.at)}
                                </p>
                                {Object.keys(a.meta).length > 0 && (
                                    <p className="text-xs text-evergreen/80">
                                        {Object.entries(a.meta)
                                            .filter(([, v]) => v !== null && v !== "")
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(" · ")}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </details>
        </div>
    );
}