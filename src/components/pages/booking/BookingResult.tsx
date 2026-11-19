// Step 3. Always server-verified. "Processing" is never shown as "Paid".
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    BadgeCheck,
    CalendarPlus,
    Download,
    Loader2,
    MapPin,
    RefreshCw,
    TimerOff,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { ApiError, api, isAbort } from "@/lib/api";
import { googleCalendarUrl } from "@/lib/calendar";
import { formatBDT, formatDateLong, formatTime12 } from "@/lib/format";
import { startBkashPayment } from "@/lib/payments";
import type { BookingDto } from "@/types/booking";
import { HoldCountdown } from "./HoldCountdown";
import { Stepper } from "./Stepper";

type State =
    | { kind: "loading" }
    | { kind: "error"; message: string; notFound: boolean }
    | { kind: "ready"; booking: BookingDto };

type View = "confirmed" | "processing" | "failed" | "expired" | "cancelled";

function viewOf(b: BookingDto): View {
    if (b.paymentStatus === "PENDING") return "processing";
    if (["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(b.bookingStatus)) return "confirmed";
    if (b.bookingStatus === "EXPIRED") return "expired";
    if (b.bookingStatus === "CANCELLED") return "cancelled";
    return "failed"; // pending booking, payment not started / failed / cancelled
}

export function BookingResult({ code }: { code: string }) {
    // Kept with the booking code it belongs to: a response for another code is never shown,
    // and a new code starts in "loading" without resetting state inside an effect.
    const [loaded, setLoaded] = useState<{ code: string; state: State } | null>(null);
    const state: State = loaded?.code === code ? loaded.state : { kind: "loading" };
    const [refreshing, setRefreshing] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);

    // The request: resolves to its outcome (null when aborted). It never sets state itself.
    type Outcome = { booking: BookingDto } | { err: ApiError | null } | null;
    const request = useCallback(
        (signal?: AbortSignal): Promise<Outcome> =>
            api<{ booking: BookingDto }>(`/api/bookings/${encodeURIComponent(code)}`, { signal }).then(
                (r): Outcome => ({ booking: r.booking }),
                (e): Outcome => (isAbort(e) ? null : { err: e instanceof ApiError ? e : null }) // aborted: left the page or the code changed
            ),
        [code]
    );

    // Applies an outcome (always from the request's own callback).
    const apply = useCallback(
        (o: Outcome) => {
            if (!o) return;
            if ("booking" in o) {
                setLoaded({ code, state: { kind: "ready", booking: o.booking } });
                return;
            }
            const err = o.err;
            setLoaded((prev) =>
                prev?.code === code && prev.state.kind === "ready" && err?.code === "NETWORK"
                    ? prev // keep the last known server state on a network blip
                    : { code, state: { kind: "error", message: err?.message ?? "Could not load your booking.", notFound: err?.status === 404 } }
            );
        },
        [code]
    );

    /** "Check again" and the auto-poll: spin the button while the request runs. */
    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            apply(await request());
        } finally {
            setRefreshing(false);
        }
    }, [request, apply]);

    useEffect(() => {
        const ctrl = new AbortController();
        request(ctrl.signal).then(apply);
        return () => ctrl.abort();
    }, [request, apply]);

    const booking = state.kind === "ready" ? state.booking : null;
    const view = booking ? viewOf(booking) : null;

    // Auto-poll while the payment is being verified.
    useEffect(() => {
        if (view !== "processing") return;
        const id = setInterval(() => {
            if (document.visibilityState === "visible") load();
        }, 4000);
        return () => clearInterval(id);
    }, [view, load]);

    async function retry() {
        if (!booking) return;
        setRetrying(true);
        setRetryError(null);
        try {
            await startBkashPayment(booking.code);
        } catch (e) {
            setRetryError(e instanceof ApiError ? e.message : "Could not start payment. Please try again.");
            setRetrying(false);
        }
    }

    if (state.kind === "loading") {
        return (
            <Shell>
                <div role="status" aria-busy className="space-y-3">
                    <span className="sr-only">Loading your booking…</span>
                    <div aria-hidden className="h-8 w-2/3 animate-pulse rounded bg-evergreen/10" />
                    <div aria-hidden className="h-40 animate-pulse rounded-2xl bg-evergreen/10" />
                </div>
            </Shell>
        );
    }

    if (state.kind === "error") {
        return (
            <Shell>
                <Card className="space-y-4" role="alert">
                    <h1 className="text-xl font-bold">{state.notFound ? "Booking not found" : "Something went wrong"}</h1>
                    <p className="text-sm">{state.message}</p>
                    <div className="flex flex-wrap gap-2">
                        {!state.notFound && <Button onClick={load}>Try again</Button>}
                        <Button href="/book" variant="outline">Start a new booking</Button>
                    </div>
                </Card>
            </Shell>
        );
    }

    const b = state.booking;
    const pickAnother = `/book?${new URLSearchParams({ sport: b.sport, date: b.date })}`;
    const when = `${formatDateLong(b.date)}, ${formatTime12(b.start)}–${formatTime12(b.end)}`;

    return (
        <Shell>
            {view === "confirmed" && (
                <div className="space-y-5">
                    <div className="space-y-5 rounded-2xl bg-evergreen p-6 text-center text-white shadow-lg">
                        {/* The page's one heading, same look as before (was a <p>) */}
                        <h1 className="inline-flex items-center justify-center gap-2 font-heading text-base font-bold text-emerald">
                            <BadgeCheck size={22} aria-hidden /> Booking confirmed
                        </h1>
                        <div>
                            <p className="text-sm text-white/75">Show this at the venue</p>
                            <p className="mt-1 break-all font-mono text-4xl font-extrabold tracking-widest md:text-5xl">
                                {b.code}
                            </p>
                        </div>
                        <div className="mx-auto flex w-fit flex-wrap items-center justify-center gap-2 rounded-xl bg-surface px-3 py-2">
                            <BookingStatusBadge status={b.bookingStatus} />
                            <PaymentStatusBadge status={b.paymentStatus} paid={b.advancePaid} />
                        </div>
                    </div>

                    <Card className="space-y-4">
                        <Details b={b} when={when} />
                        <dl className="space-y-1.5 rounded-xl bg-mint p-3 text-sm">
                            {b.discountAmount > 0 && <Line label="Discount" value={`−${formatBDT(b.discountAmount)}`} />}
                            <Line label="Total" value={formatBDT(b.total)} />
                            <Line label="Advance paid" value={formatBDT(b.advancePaid)} />
                            <Line label="Balance due at venue" value={formatBDT(b.balanceDue)} strong />
                        </dl>
                        <p className="text-sm text-evergreen/85">
                            Arrive early. Check-in opens {b.checkInOpensMinutes} minutes before your slot starts and stays open until it ends.
                        </p>
                    </Card>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            href={googleCalendarUrl({
                                title: `Kazi Sports Arena: ${b.pitchName} (${b.sport})`,
                                startAt: b.startAt,
                                endAt: b.endAt,
                                location: b.branchAddress,
                                details: `Booking code ${b.code}. Balance due at venue: ${formatBDT(b.balanceDue)}.`,
                            })}
                            variant="outline"
                        >
                            <CalendarPlus size={18} aria-hidden /> Add to Google Calendar
                        </Button>
                        {/* A receipt exists only once money was received (not for a no-advance booking). */}
                        {b.advancePaid > 0 && <a
                            href={`/api/bookings/${encodeURIComponent(b.code)}/receipt`}
                            download
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-teal px-4 font-heading text-sm font-semibold text-teal transition-colors hover:bg-mint"
                        >
                            <Download size={18} aria-hidden /> Download receipt
                        </a>}
                        {b.branchMapUrl && (
                            <Button href={b.branchMapUrl} variant="secondary">
                                <MapPin size={18} aria-hidden /> Directions
                            </Button>
                        )}
                        <Button href={`/account?b=${encodeURIComponent(b.code)}`} variant="ghost">
                            View in my account
                        </Button>
                    </div>
                </div>
            )}

            {view === "processing" && (
                <Card className="space-y-4" role="status">
                    <h1 className="flex items-center gap-2 text-xl font-bold">
                        <Loader2 size={22} aria-hidden className="animate-spin text-teal" /> We are verifying your payment
                    </h1>
                    <p className="text-sm">
                        This usually takes a few seconds. Your booking is <strong>not confirmed yet</strong>. This page updates
                        automatically. Please do not pay again.
                    </p>
                    <Details b={b} when={when} />
                    <Button variant="outline" onClick={load} disabled={refreshing}>
                        <RefreshCw size={16} aria-hidden className={refreshing ? "animate-spin" : ""} /> Check again
                    </Button>
                </Card>
            )}

            {/* No live role on this card: it holds the ticking HoldCountdown, which a live
                region would re-announce every second. The h1 states the outcome. */}
            {view === "failed" && (
                <Card className="space-y-4">
                    <h1 className="flex items-center gap-2 text-xl font-bold">
                        <XCircle size={22} aria-hidden className="text-booked" />
                        {b.paymentStatus === "FAILED"
                            ? "Payment failed"
                            : b.paymentStatus === "CANCELLED"
                                ? "Payment cancelled"
                                : "Payment not completed"}
                    </h1>
                    <p className="text-sm">
                        {b.holdActive
                            ? "Your slot is still held. You can try the payment again before the hold ends."
                            : "Your hold has ended and the slot was released."}
                    </p>
                    <Details b={b} when={when} />
                    {b.holdActive && <HoldCountdown expiresAt={b.holdExpiresAt} serverNow={b.serverNow} onExpire={load} />}
                    {retryError && (
                        <p role="alert" className="flex items-start gap-2 rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /> {retryError}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {b.holdActive ? (
                            <Button size="lg" onClick={retry} disabled={retrying}>
                                {retrying ? "Opening bKash…" : `Retry payment (${formatBDT(b.advanceAmount)})`}
                            </Button>
                        ) : (
                            <Button size="lg" href={pickAnother}>Pick another slot</Button>
                        )}
                    </div>
                </Card>
            )}

            {view === "expired" && (
                <Card className="space-y-4" role="alert">
                    <h1 className="flex items-center gap-2 text-xl font-bold">
                        <TimerOff size={22} aria-hidden className="text-held" /> This hold has expired
                    </h1>
                    <p className="text-sm">The slot was released. Start again with the same sport and date.</p>
                    <Button size="lg" href={pickAnother}>Pick again</Button>
                </Card>
            )}

            {view === "cancelled" && (
                <Card className="space-y-4">
                    <h1 className="flex items-center gap-2 text-xl font-bold">
                        <AlertTriangle size={22} aria-hidden className="text-booked" /> This booking was cancelled
                    </h1>
                    <div className="flex flex-wrap gap-2">
                        <Button href={pickAnother}>Book another slot</Button>
                        <Button href="/account" variant="outline">Go to my account</Button>
                    </div>
                </Card>
            )}
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <>
            <div className="bg-evergreen text-white">
                <div className="mx-auto max-w-2xl px-4 py-6">
                    <Stepper step={3} />
                </div>
            </div>
            <div className="mx-auto max-w-2xl px-4 py-8 pb-32 md:pb-10">
                {children}
                <p className="mt-6 text-sm">
                    <Link href="/" className="font-semibold text-teal underline underline-offset-2">
                        Back to Home
                    </Link>
                </p>
            </div>
        </>
    );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={`flex justify-between gap-4 ${strong ? "font-bold" : ""}`}>
            <dt>{label}</dt>
            <dd className="font-semibold">{value}</dd>
        </div>
    );
}

function Details({ b, when }: { b: BookingDto; when: string }) {
    return (
        <dl className="space-y-1.5 text-sm">
            <Line label="Field" value={`${b.pitchName} · ${b.sport}`} />
            <Line label="When" value={when} />
        </dl>
    );
}