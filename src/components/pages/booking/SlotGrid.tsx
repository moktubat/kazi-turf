"use client";
import { useEffect, useState } from "react";
import { Check, Timer, X, Wrench } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import type { Cell } from "@/server/availability";
import type { PitchAvailability } from "@/types/booking";
import { SlotChip } from "./SlotChip";

const legend = [
    { icon: Check, label: "Available", cls: "bg-emerald/15 border-emerald" },
    { icon: Timer, label: "Held", cls: "bg-held-soft border-held/40 text-held" },
    { icon: X, label: "Booked", cls: "bg-booked-soft border-booked/40 text-booked" },
    { icon: Wrench, label: "Maintenance", cls: "bg-maint-soft border-maint/40 text-maint" },
];

export function SlotGrid({
    pitches,
    selectedPitchId,
    selected,
    preferPitchId,
    onToggle,
}: {
    pitches: PitchAvailability[];
    selectedPitchId: string | null;
    selected: string[];
    preferPitchId?: string;
    onToggle: (pitchId: string, cell: Cell) => void;
}) {
    // Live "now" — ticks every 60s so a slot auto-hides the moment its start time passes,
    // without waiting for the 30s server auto-refresh in BookingFlow.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Hide past slots
    const isPast = (c: Cell) =>
        c.status === "PAST" || new Date(c.cellStart).getTime() <= now - 60_000;

    // Drop past cells; drop any pitch that has no visible cells left (e.g. all 6 AM – 4 PM past).
    const visiblePitches = pitches
        .map((p) => ({ ...p, cells: p.cells.filter((c) => !isPast(c)) }))
        .filter((p) => p.cells.length > 0);

    const [mobilePitch, setMobilePitch] = useState(
        preferPitchId && visiblePitches.some((p) => p.id === preferPitchId)
            ? preferPitchId
            : visiblePitches[0]?.id
    );
    const activeId = visiblePitches.some((p) => p.id === mobilePitch)
        ? mobilePitch
        : visiblePitches[0]?.id;
    const active = visiblePitches.find((p) => p.id === activeId);

    const isSelected = (pitchId: string, cell: Cell) =>
        selectedPitchId === pitchId && selected.includes(cell.cellStart);

    if (visiblePitches.length === 0) {
        return (
            <div className="rounded-2xl border border-evergreen/10 bg-surface p-8 text-center">
                <p className="font-semibold text-evergreen">All slots for today have already started.</p>
                <p className="mt-1 text-sm text-evergreen/70">
                    Pick a future date from the date picker above to see available slots.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <ul className="flex flex-wrap gap-2" aria-label="Slot legend">
                {legend.map(({ icon: Icon, label, cls }) => (
                    <li
                        key={label}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}
                    >
                        <Icon size={12} aria-hidden /> {label}
                    </li>
                ))}
            </ul>

            {/* Desktop: pitch rows x time columns */}
            <div className="hidden space-y-5 md:block">
                {visiblePitches.map((p) => (
                    <section
                        key={p.id}
                        aria-label={p.name}
                        className="rounded-2xl border border-evergreen/10 bg-surface p-4 shadow-sm"
                    >
                        <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                            <h3 className="text-base font-bold">{p.name}</h3>
                            <p className="text-sm text-evergreen/70">
                                {p.format}
                                {p.maxConsecutiveSlots > 1 && ` · up to ${p.maxConsecutiveSlots} consecutive slots`}
                            </p>
                        </div>
                        <div className="scrollbar-thin overflow-x-auto pb-2">
                            <div className="grid grid-flow-col auto-cols-[5.75rem] justify-start gap-2">
                                {p.cells.map((c) => (
                                    <SlotChip
                                        key={c.cellStart}
                                        cell={c}
                                        selected={isSelected(p.id, c)}
                                        onSelect={() => onToggle(p.id, c)}
                                    />
                                ))}
                            </div>
                        </div>
                    </section>
                ))}
            </div>

            {/* Mobile: pitch tabs + wrapped chip grid (no sideways-only scrolling) */}
            <div className="md:hidden">
                {visiblePitches.length > 1 && (
                    <Tabs
                        label="Pitches"
                        items={visiblePitches.map((p) => ({ id: p.id, label: p.name }))}
                        value={activeId ?? ""}
                        onChange={setMobilePitch}
                    />
                )}
                {active && (
                    <div
                        {...(visiblePitches.length > 1
                            ? { role: "tabpanel", id: `panel-${active.id}`, "aria-labelledby": `tab-${active.id}` }
                            : {})}
                        className="mt-3"
                    >
                        <p className="mb-2 text-sm text-evergreen/70">
                            {active.format}
                            {active.maxConsecutiveSlots > 1 && ` · up to ${active.maxConsecutiveSlots} consecutive slots`}
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {active.cells.map((c) => (
                                <SlotChip
                                    key={c.cellStart}
                                    cell={c}
                                    selected={isSelected(active.id, c)}
                                    onSelect={() => onToggle(active.id, c)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}