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
import { policies } from "@/data/site";
import { ApiError, api } from "@/lib/api";
import { googleCalendarUrl } from "@/lib/calendar";
import { formatBDT, formatDateLong } from "@/lib/format";
import { startBkashPayment } from "@/lib/payments";
import type { BookingDto } from "@/types/booking";
import { HoldCountdown } from "./HoldCountdown";

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
    const [state, setState] = useState<State>({ kind: "loading" });
    const [refreshing, setRefreshing] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const r = await api<{ booking: BookingDto }>(`/api/bookings/${encodeURIComponent(code)}`);
            setState({ kind: "ready", booking: r.booking });
        } catch (e) {
            const err = e instanceof ApiError ? e : null;
            setState((prev) =>
                prev.kind === "ready" && err?.code === "NETWORK"
                    ? prev // keep the last known server state on a network blip
                    : { kind: "error", message: err?.message ?? "Could not load your booking.", notFound: err?.status === 404 }
            );
        } finally {
            setRefreshing(false);
        }
    }, [code]);

    useEffect(() => {
        load();
    }, [load]);

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
                <div aria-busy className="space-y-3">
                    <div className="h-8 w-2/3 animate-pulse rounded bg-evergreen/10" />
                    <div className="h-40 animate-pulse rounded-2xl bg-evergreen/10" />
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
    const pickAnother = `/book?${new URLSearchParams({ branch: b.branchId, sport: b.sport, date: b.date })}`;
    const when = `${formatDateLong(b.date)}, ${b.start}–${b.end}`;

    return (
        <Shell>
            {view === "confirmed" && (
                <div className="space-y-5">
                    <Card className="space-y-5 border-teal/30 text-center">
                        <p className="inline-flex items-center justify-center gap-2 font-heading font-bold text-teal">
                            <BadgeCheck size={22} aria-hidden /> Booking confirmed
                        </p>
                        <div>
                            <p className="text-sm text-evergreen/80">Show this at the venue</p>
                            <p className="mt-1 font-mono text-4xl font-extrabold tracking-widest md:text-5xl" aria-label={`Booking code ${b.code}`}>
                                {b.code}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <BookingStatusBadge status={b.bookingStatus} />
                            <PaymentStatusBadge status={b.paymentStatus} />
                        </div>
                    </Card>

                    <Card className="space-y-4">
                        <Details b={b} when={when} />
                        <dl className="space-y-1.5 rounded-xl bg-mint p-3 text-sm">
                            <Line label="Total" value={formatBDT(b.total)} />
                            <Line label="Advance paid" value={formatBDT(b.advancePaid)} />
                            <Line label="Balance due at venue" value={formatBDT(b.balanceDue)} strong />
                        </dl>
                        <p className="text-sm text-evergreen/85">
                            Arrive early. Check-in opens {policies.checkInOpensMinutesBefore} minutes before your slot starts and stays
                            open until it ends. Staff may ask for the last digits of your phone number.
                        </p>
                    </Card>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            href={googleCalendarUrl({
                                title: `KaziTurf: ${b.pitchName} (${b.sport})`,
                                startAt: b.startAt,
                                endAt: b.endAt,
                                location: `${b.branchName}: ${b.branchAddress}`,
                                details: `Booking code ${b.code}. Balance due at venue: ${formatBDT(b.balanceDue)}.`,
                            })}
                            variant="outline"
                        >
                            <CalendarPlus size={18} aria-hidden /> Add to Google Calendar
                        </Button>
                        {/* Receipt route arrives in Batch 6 */}
                        <a
                            href={`/api/bookings/${encodeURIComponent(b.code)}/receipt`}
                            download
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-teal px-4 font-heading text-sm font-semibold text-teal hover:bg-mint"
                        >
                            <Download size={18} aria-hidden /> Download receipt
                        </a>
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

            {view === "failed" && (
                <Card className="space-y-4" role="alert">
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
                    {retryError && <p className="text-sm font-medium text-booked">{retryError}</p>}
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
                    <p className="text-sm">The slot was released. Start again with the same branch, sport and date.</p>
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
        <div className="mx-auto max-w-2xl px-4 py-8 pb-32 md:pb-10">
            {children}
            <p className="mt-6 text-sm">
                <Link href="/" className="font-semibold text-teal underline underline-offset-2">
                    Back to Home
                </Link>
            </p>
        </div>
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
            <Line label="Branch" value={b.branchName} />
            <Line label="Pitch" value={`${b.pitchName} · ${b.sport}`} />
            <Line label="When" value={when} />
        </dl>
    );
}