"use client";
// Small building blocks shared by the Regular price and Temporary price forms.
import { Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatTime12 } from "@/lib/format";
import { DAY_NAMES } from "@/lib/grid";
import { toMinutes } from "@/lib/time";
import { Check } from "./ui";

export const chip = (active: boolean, disabled = false) =>
    cn(
        "min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors",
        active
            ? "border-teal bg-teal text-white"
            : disabled
                ? "cursor-not-allowed border-evergreen/10 bg-surface text-evergreen/30"
                : "border-evergreen/15 bg-surface text-evergreen hover:border-teal hover:bg-mint/40"
    );

const DAY_PRESETS: { label: string; days: number[] }[] = [
    { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
    { label: "Weekdays (Sun–Thu)", days: [0, 1, 2, 3, 4] },
    { label: "Weekend (Fri–Sat)", days: [5, 6] },
];

export function DayPicker({ value, onChange, error }: { value: number[]; onChange: (d: number[]) => void; error?: string }) {
    const same = (a: number[]) => a.length === value.length && a.every((d) => value.includes(d));
    return (
        <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-semibold">Days</legend>
            <div className="flex flex-wrap gap-2">
                {DAY_PRESETS.map((p) => (
                    <button key={p.label} type="button" aria-pressed={same(p.days)} onClick={() => onChange(p.days)} className={chip(same(p.days))}>
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                {DAY_NAMES.map((name, d) => (
                    <Check
                        key={name}
                        label={name}
                        checked={value.includes(d)}
                        onChange={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}
                    />
                ))}
            </div>
            {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}
        </fieldset>
    );
}

// Quick Pick = a convenient TIME RANGE, never one big slot. It is snapped to the
// field's own slot grid: a slot belongs to a phase when it STARTS inside it
// (the same rule prices use), so phases never overlap and never leave gaps.
const PHASES: { name: string; from: string; until: string }[] = [
    { name: "Late night", from: "00:00", until: "06:00" },
    { name: "Morning", from: "06:00", until: "12:00" },
    { name: "Afternoon", from: "12:00", until: "17:00" },
    { name: "Evening", from: "17:00", until: "21:00" },
    { name: "Night", from: "21:00", until: "24:00" },
];

/** Keep only boundaries that sit a whole number of slots after the first one. */
export function onGrid(times: string[]): string[] {
    if (times.length < 2) return times;
    const o = toMinutes(times[0]);
    const step = toMinutes(times[1]) - o;
    return step > 0 ? times.filter((t) => (toMinutes(t) - o) % step === 0) : times;
}

/** First grid boundary at or after `hhmm` (or the last boundary). */
function snap(times: string[], hhmm: string): string {
    const m = toMinutes(hhmm);
    return times.find((t) => toMinutes(t) >= m) ?? times[times.length - 1] ?? hhmm;
}

/** The individual bookable slots inside [start, end) on this grid. */
export function slotsIn(times: string[], start: string, end: string): { start: string; end: string }[] {
    const s = toMinutes(start);
    const e = toMinutes(end);
    const out: { start: string; end: string }[] = [];
    for (let i = 0; i < times.length - 1; i++) {
        const m = toMinutes(times[i]);
        if (m >= s && m < e) out.push({ start: times[i], end: times[i + 1] });
    }
    return out;
}

/** Time window on the field's slot grid. `times` = grid boundaries ("00:00" … "24:00"). */
export function TimePicker({
    times: rawTimes,
    start,
    end,
    onChange,
    startLabel = "From",
    error,
    wholeDay = false,
}: {
    times: string[];
    start: string;
    end: string;
    onChange: (start: string, end: string) => void;
    startLabel?: string;
    error?: string;
    wholeDay?: boolean;
}) {
    // Real slot boundaries only. If the slot length does not divide the day
    // (e.g. 105 min), the trailing partial piece is not a bookable slot and the
    // server would reject a range ending there.
    const times = onGrid(rawTimes);
    const first = times[0] ?? "00:00";
    const last = times[times.length - 1] ?? "24:00";
    const phases = [
        ...(wholeDay ? [{ name: "Whole day", from: first, until: last }] : []),
        ...PHASES.map((p) => ({ name: p.name, from: snap(times, p.from), until: snap(times, p.until) })),
    ].filter((p) => toMinutes(p.from) < toMinutes(p.until));
    const starts = [...new Set([...times.slice(0, -1), start])].sort();
    const ends = [...new Set([...times.slice(1), end])].sort();
    const covered = slotsIn(times, start, end);
    const SHOW = 24;
    return (
        <div className="space-y-2">
            <p className="text-sm font-semibold">Time of day</p>
            <p className="text-xs text-evergreen/60">Quick pick a range. It covers several separate slots, it does not create one long slot.</p>
            <div className="flex flex-wrap gap-2">
                {phases.map((p) => {
                    const active = start === p.from && end === p.until;
                    return (
                        <button key={p.name} type="button" aria-pressed={active} onClick={() => onChange(p.from, p.until)} className={chip(active)}>
                            {p.name} · {formatTime12(p.from)}–{formatTime12(p.until)}
                        </button>
                    );
                })}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Select label={startLabel} value={start} onChange={(e) => onChange(e.target.value, end)}>
                    {starts.map((t) => (
                        <option key={t} value={t}>{formatTime12(t)}</option>
                    ))}
                </Select>
                <Select label="Until" value={end} error={error} onChange={(e) => onChange(start, e.target.value)}>
                    {ends.map((t) => (
                        <option key={t} value={t}>{formatTime12(t)}</option>
                    ))}
                </Select>
            </div>
            {/* The real, individual bookable slots this range covers on this field. */}
            <div className="rounded-lg border border-teal/30 bg-mint/40 p-3" aria-live="polite">
                <p className="text-sm font-semibold text-teal">
                    {covered.length > 0
                        ? `Covers ${covered.length} separate slot${covered.length === 1 ? "" : "s"} each day`
                        : "Pick a valid time range"}
                </p>
                {covered.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        {covered.slice(0, SHOW).map((c) => (
                            <li key={c.start} className="rounded-md border border-evergreen/15 bg-surface px-2 py-1 tabular-nums">
                                {formatTime12(c.start)}–{formatTime12(c.end)}
                            </li>
                        ))}
                        {covered.length > SHOW && <li className="px-1 py-1 text-evergreen/60">+{covered.length - SHOW} more</li>}
                    </ul>
                )}
            </div>
        </div>
    );
}

/** "Check before saving" box. */
export function Summary({ title, rows, children }: { title: string; rows: [string, string][]; children?: React.ReactNode }) {
    return (
        <section aria-live="polite" aria-label={title} className="rounded-xl border-2 border-teal/30 bg-mint/40 p-4">
            <p className="font-heading text-sm font-bold text-teal">{title}</p>
            <dl className="mt-2 space-y-1 text-sm">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                        <dt className="text-evergreen/70">{k}</dt>
                        <dd className="text-right font-semibold">{v}</dd>
                    </div>
                ))}
            </dl>
            {children}
        </section>
    );
}
