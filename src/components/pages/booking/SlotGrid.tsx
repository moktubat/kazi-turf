"use client";
import { useState } from "react";
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
    const [mobilePitch, setMobilePitch] = useState(
        preferPitchId && pitches.some((p) => p.id === preferPitchId) ? preferPitchId : pitches[0]?.id
    );
    const activeId = pitches.some((p) => p.id === mobilePitch) ? mobilePitch : pitches[0]?.id;
    const active = pitches.find((p) => p.id === activeId);

    const isSelected = (pitchId: string, cell: Cell) =>
        selectedPitchId === pitchId && selected.includes(cell.cellStart);

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
                {pitches.map((p) => (
                    <section key={p.id} aria-label={p.name}>
                        <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                            <h3 className="text-base font-bold">{p.name}</h3>
                            <p className="text-sm text-evergreen/70">
                                {p.format}
                                {p.maxConsecutiveSlots > 1 && ` · up to ${p.maxConsecutiveSlots} consecutive slots`}
                            </p>
                        </div>
                        <div className="overflow-x-auto pb-2">
                            <div className="grid grid-flow-col auto-cols-[minmax(5.75rem,1fr)] gap-2">
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
                {pitches.length > 1 && (
                    <Tabs
                        label="Pitches"
                        items={pitches.map((p) => ({ id: p.id, label: p.name }))}
                        value={activeId ?? ""}
                        onChange={setMobilePitch}
                    />
                )}
                {active && (
                    <div
                        {...(pitches.length > 1
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