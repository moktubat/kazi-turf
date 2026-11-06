"use client";
import { useEffect, useState } from "react";
import { MapPin, Timer } from "lucide-react";
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
        <div className="space-y-4 rounded-2xl bg-evergreen p-5 text-white shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-white">Next booking</h2>
                {ms !== null && (
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-sm font-semibold text-teal">
                        <Timer size={14} aria-hidden /> {ms <= 0 ? "Happening now" : `Starts in ${left(ms)}`}
                    </p>
                )}
            </div>

            <div>
                <p className="font-heading text-xl font-extrabold text-white">
                    {formatDateLong(b.date)} · {formatTime12(b.start)}–{formatTime12(b.end)}
                </p>
                <p className="text-sm text-white/75">
                    {b.pitchName} · {b.sport}
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-surface/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Booking code</p>
                    <p className="font-mono text-2xl font-extrabold tracking-widest">{b.code}</p>
                </div>
                <div className="rounded-xl bg-surface/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Balance due at venue</p>
                    <p className="font-heading text-2xl font-extrabold">{formatBDT(b.balanceDue)}</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {b.branchMapUrl && (
                    <Button href={b.branchMapUrl} variant="secondary">
                        <MapPin size={18} aria-hidden /> Directions
                    </Button>
                )}
                <Button variant="light" onClick={onOpen}>
                    View details
                </Button>
            </div>
        </div>
    );
}