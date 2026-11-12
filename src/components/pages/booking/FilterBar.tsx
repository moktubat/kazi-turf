"use client";
import { CalendarDays, ChevronDown } from "lucide-react";
import { addDays } from "@/lib/time";

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

const label = "block text-xs font-bold uppercase tracking-wider text-evergreen/60";
const control = "mt-1 block w-full min-w-0 cursor-pointer bg-transparent text-base font-semibold text-evergreen outline-none";
const cell = "rounded-2xl px-4 py-3 transition-colors focus-within:bg-mint/70 hover:bg-mint/50";

export function FilterBar({
    venue,
    sport,
    date,
    minDate,
    maxDate,
    pitches,
    pitchFilter,
    onSport,
    onDate,
    onPitch,
}: {
    venue: FlowVenue;
    sport: string;
    date: string;
    minDate: string;
    maxDate: string;
    pitches?: FlowPitch[];
    pitchFilter: string;
    onSport: (s: string) => void;
    onDate: (d: string) => void;
    onPitch: (p: string) => void;
}) {
    const horizon = Math.max(0, Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86_400_000));

    return (
        <div className="rounded-3xl border border-evergreen/10 bg-[#F5F7F3] p-3 shadow-sm sm:p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:items-center lg:gap-2">
                {/* Sport */}
                <div className={cell}>
                    <label className={label}>Sport</label>
                    <div className="relative mt-1">
                        <select
                            aria-label="Sport"
                            value={sport}
                            onChange={(e) => onSport(e.target.value)}
                            className={`${control} appearance-none pr-8`}
                        >
                            {venue.sports.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-evergreen/50" />
                    </div>
                </div>

                {/* Field */}
                <div className={`${cell} lg:border-l lg:border-evergreen/10`}>
                    <label className={label}>Field</label>
                    <div className="relative mt-1">
                        <select
                            aria-label="Field"
                            value={pitchFilter}
                            onChange={(e) => onPitch(e.target.value)}
                            disabled={!pitches || pitches.length === 0}
                            className={`${control} appearance-none pr-8 disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            <option value="">Any field</option>
                            {(pitches ?? []).map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}{p.format ? ` · ${p.format}` : ""}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-evergreen/50" />
                    </div>
                </div>

                {/* Date */}
                <div className={`${cell} lg:border-l lg:border-evergreen/10`}>
                    <label className={label}>
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays size={12} aria-hidden className="text-teal" /> Date
                        </span>
                    </label>
                    <input
                        type="date"
                        value={date}
                        min={minDate}
                        max={maxDate}
                        onChange={(e) => e.target.value && onDate(e.target.value)}
                        className={control}
                        aria-label="Pick a date"
                    />
                </div>
            </div>

            <p className="mt-2 px-1 text-xs text-evergreen/60">
                Booking window: {horizon} {horizon === 1 ? "day" : "days"} ahead.
            </p>
        </div>
    );
}

// Unused but kept to avoid breaking imports if anything references it.
export const _datesBetween = (min: string, max: string) => {
    const out: string[] = [];
    for (let d = min; d <= max; d = addDays(d, 1)) out.push(d);
    return out;
};