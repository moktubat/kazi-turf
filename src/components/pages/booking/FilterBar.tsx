"use client";
import { CalendarDays, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface FlowVenue {
    id: string;
    name: string;
    address: string;
    mapUrl: string;
    sports: string[];
}

export interface FlowPitch {
    id: string;
    name: string;
    format: string;
}

const stepLabel = "flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.14em] text-evergreen/60";
const stepNo =
    "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-teal font-heading text-xs font-bold text-white";
const control =
    "block w-full min-w-0 rounded-xl border border-evergreen/15 bg-paper px-3 py-2.5 text-base font-semibold text-evergreen transition-colors focus:border-teal";

export function FilterBar({
    venue,
    sport,
    pitches,
    pitchFilter,
    date,
    minDate,
    maxDate,
    refreshing,
    onSport,
    onPitch,
    onDate,
    onRefresh,
}: {
    venue: FlowVenue;
    sport: string;
    pitches?: FlowPitch[];
    pitchFilter: string;
    date: string;
    minDate: string;
    maxDate: string;
    refreshing: boolean;
    onSport: (s: string) => void;
    onPitch: (p: string) => void;
    onDate: (d: string) => void;
    onRefresh: () => void;
}) {
    const horizon = Math.max(0, Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86_400_000));

    return (
        <div className="rounded-3xl border border-evergreen/10 bg-surface p-4 shadow-sm sm:p-5">
            {/* Desktop: sport and pitch a step narrower, date + refresh a step wider.
                Below lg everything stacks in one column as before. */}
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.4fr] lg:gap-4">
                {/* 1 · Select Sport (single location, so sport takes the first spot) */}
                <section aria-label="Select sport">
                    <p className={stepLabel}>
                        <span className={stepNo} aria-hidden>1</span> Select Sport
                    </p>
                    <div className="relative mt-2.5">
                        {venue.sports.length === 1 ? (
                            <p className={`${control} flex min-h-11 items-center`}>{venue.sports[0]}</p>
                        ) : (
                            <>
                                <select
                                    aria-label="Select sport"
                                    value={sport}
                                    onChange={(e) => onSport(e.target.value)}
                                    className={`${control} appearance-none pr-9`}
                                >
                                    {venue.sports.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-evergreen/50" />
                            </>
                        )}
                    </div>
                </section>

                {/* 2 · Select Pitch */}
                <section aria-label="Select pitch">
                    <p className={stepLabel}>
                        <span className={stepNo} aria-hidden>2</span> Select Pitch
                    </p>
                    <div className="relative mt-2.5">
                        <select
                            aria-label="Select pitch"
                            value={pitchFilter}
                            onChange={(e) => onPitch(e.target.value)}
                            className={`${control} appearance-none pr-9`}
                        >
                            {(!pitches || pitches.length === 0) ? (
                                <option value="">{pitches === undefined ? "Loading pitches…" : "No pitches"}</option>
                            ) : (
                                <>
                                    <option value="">All pitches</option>
                                    {pitches.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}{p.format ? ` · ${p.format}` : ""}
                                        </option>
                                    ))}
                                </>
                            )}
                        </select>
                        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-evergreen/50" />
                    </div>
                </section>

                {/* 3 · Select Date + Refresh + Auto refresh */}
                <section aria-label="Select date">
                    <p className={stepLabel}>
                        <span className={stepNo} aria-hidden>3</span> Select Date
                    </p>
                    <div className="mt-2.5 flex gap-2">
                        <div className="relative min-w-0 flex-1">
                            <CalendarDays size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal" />
                            <input
                                type="date"
                                aria-label="Pick a date"
                                value={date}
                                min={minDate}
                                max={maxDate}
                                onChange={(e) => e.target.value && onDate(e.target.value)}
                                className={`${control} pl-9`}
                            />
                        </div>
                        <Button onClick={onRefresh} disabled={refreshing} aria-label="Refresh availability" className="shrink-0">
                            <RefreshCw size={16} aria-hidden className={refreshing ? "animate-spin" : ""} /> Refresh
                        </Button>
                    </div>
                </section>
            </div>

            <p className="mt-3 px-1 text-xs text-evergreen/60">
                Booking window: {horizon} {horizon === 1 ? "day" : "days"} ahead.
            </p>
        </div>
    );
}