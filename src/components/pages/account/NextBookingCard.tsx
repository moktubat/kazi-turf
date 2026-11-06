"use client";
import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBDT, formatDateLong, formatTime12 } from "@/lib/format";
import type { AccountBookingDto } from "@/types/account";

function left(ms: number): string {
    const mins = Math.floor(ms / 60_000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${Math.max(m, 1)} min`;
}

export function NextBookingCard({ b, onOpen }: { b: AccountBookingDto; onOpen: () => void }) {
    // Set after mount so server and client markup match.
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        const tick = () => setNow(Date.now());
        tick();
        const id = setInterval(tick, 30_000);
        return () => clearInterval(id);
    }, []);

    const ms = now === null ? null : Date.parse(b.startAt) - now;

    return (
        <section
            aria-labelledby="next-booking-title"
            className="relative overflow-hidden rounded-2xl border border-teal/20 bg-surface shadow-lift"
        >
            {/* Left accent stripe */}
            <div aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-teal" />

            <div className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-lg bg-teal text-surface">
                            <CalendarDays size={16} aria-hidden />
                        </span>
                        <h2
                            id="next-booking-title"
                            className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-evergreen/70"
                        >
                            Next booking
                        </h2>
                    </div>
                    {ms !== null && (
                        <p
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${ms <= 0 ? "bg-teal text-surface" : "bg-held-soft text-held"
                                }`}
                        >
                            <Timer size={12} aria-hidden />
                            {ms <= 0 ? "Happening now" : `Starts in ${left(ms)}`}
                        </p>
                    )}
                </div>

                <div className="space-y-1">
                    <p className="font-heading text-lg font-extrabold sm:text-xl">
                        {formatDateLong(b.date)}
                    </p>
                    <p className="font-heading text-base font-bold text-teal">
                        {formatTime12(b.start)} – {formatTime12(b.end)}
                    </p>
                    <p className="text-sm text-evergreen/75">
                        {b.pitchName} · {b.sport}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-evergreen/10 bg-mint/40 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-evergreen/60">
                            Booking code
                        </p>
                        <p className="mt-1 font-mono text-lg font-extrabold tracking-wider sm:text-xl">
                            {b.code}
                        </p>
                    </div>
                    <div className="rounded-xl border border-evergreen/10 bg-mint/40 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-evergreen/60">
                            Balance at venue
                        </p>
                        <p className="mt-1 font-heading text-lg font-extrabold sm:text-xl">
                            {formatBDT(b.balanceDue)}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {b.branchMapUrl && (
                        <Button href={b.branchMapUrl} variant="outline">
                            <MapPin size={16} aria-hidden /> Directions
                        </Button>
                    )}
                    <Button variant="primary" onClick={onOpen}>
                        View details
                    </Button>
                </div>
            </div>
        </section>
    );
}