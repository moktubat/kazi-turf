"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Field";
import { BookingStatusBadge } from "@/components/ui/StatusBadge";
import { ApiError, api, isAbort } from "@/lib/api";
import { formatDateLong, formatTime12 } from "@/lib/format";
import type { AdminBookingDto } from "@/types/admin";

// Always visible on the Desk. Search by booking code, phone or name.
export function FindBooking({ onPick }: { onPick: (code: string) => void }) {
    const [q, setQ] = useState("");
    // The last finished search, with the term it was for. Everything shown is derived from it,
    // so the effect never sets state synchronously and an old response can never be shown
    // as the answer to a newer term (it is aborted, and its term would not match anyway).
    const [done, setDone] = useState<{ term: string; results: AdminBookingDto[] | null; error: string | null } | null>(null);

    const term = q.trim();
    const active = term.length >= 3;
    const loading = active && done?.term !== term;
    // While a new search runs, the previous results stay visible (as before); under 3 characters nothing shows.
    const results = active ? (done?.results ?? null) : null;
    const error = active ? (done?.error ?? null) : null;

    useEffect(() => {
        if (!active) return;
        const ctrl = new AbortController();
        const t = setTimeout(async () => {
            try {
                const r = await api<{ bookings: AdminBookingDto[] }>(
                    `/api/admin/bookings?${new URLSearchParams({ q: term, limit: "8" })}`,
                    { signal: ctrl.signal }
                );
                setDone({ term, results: r.bookings, error: null });
            } catch (e) {
                if (isAbort(e)) return;
                const message = e instanceof ApiError ? e.message : "Search failed.";
                setDone((prev) => ({ term, results: prev?.results ?? null, error: message }));
            }
        }, 300);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [active, term]);

    return (
        <div className="space-y-2">
            <div className="relative">
                <Input
                    label="Find booking"
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Code, phone or name"
                    autoComplete="off"
                    className="pr-10"
                />
                <Search size={18} aria-hidden className="pointer-events-none absolute bottom-3 right-3 text-evergreen/50" />
            </div>

            <div aria-live="polite">
                {loading && <p className="text-sm text-evergreen/70">Searching…</p>}
                {error && <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{error}</p>}
                {results && results.length === 0 && !loading && (
                    <p className="text-sm text-evergreen/70">No bookings found.</p>
                )}
            </div>

            {results && results.length > 0 && (
                <ul className="divide-y divide-evergreen/10 rounded-xl border border-evergreen/10 bg-surface">
                    {results.map((b) => (
                        <li key={b.code}>
                            <button
                                type="button"
                                onClick={() => {
                                    onPick(b.code);
                                    setQ("");
                                }}
                                className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-mint"
                            >
                                <span className="min-w-0">
                                    <span className="font-mono font-bold">{b.code}</span>
                                    <span className="ml-2 text-sm">{b.customerName}</span>
                                    <span className="block text-xs text-evergreen/70">
                                        {formatDateLong(b.date)} · {formatTime12(b.start)}–{formatTime12(b.end)} · {b.pitchName}
                                    </span>
                                </span>
                                <BookingStatusBadge status={b.bookingStatus} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}