"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Field";
import { BookingStatusBadge } from "@/components/ui/StatusBadge";
import { ApiError, api, isAbort } from "@/lib/api";
import { formatDateLong } from "@/lib/format";
import type { AdminBookingDto } from "@/types/admin";

// Always visible on the Desk. Search by booking code, phone or name.
export function FindBooking({ onPick }: { onPick: (code: string) => void }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState<AdminBookingDto[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const term = q.trim();
        if (term.length < 3) {
            setResults(null);
            setError(null);
            return;
        }
        const ctrl = new AbortController();
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const r = await api<{ bookings: AdminBookingDto[] }>(
                    `/api/admin/bookings?${new URLSearchParams({ q: term, limit: "8" })}`,
                    { signal: ctrl.signal }
                );
                setResults(r.bookings);
                setError(null);
            } catch (e) {
                if (isAbort(e)) return;
                setError(e instanceof ApiError ? e.message : "Search failed.");
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [q]);

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
                {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}
                {results && results.length === 0 && !loading && (
                    <p className="text-sm text-evergreen/70">No bookings found.</p>
                )}
            </div>

            {results && results.length > 0 && (
                <ul className="divide-y divide-evergreen/10 rounded-xl border border-evergreen/10 bg-white">
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
                                <span>
                                    <span className="font-mono font-bold">{b.code}</span>
                                    <span className="ml-2 text-sm">{b.customerName}</span>
                                    <span className="block text-xs text-evergreen/70">
                                        {formatDateLong(b.date)} · {b.start}–{b.end} · {b.pitchName}
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