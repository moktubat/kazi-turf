"use client";
import { useEffect, useState } from "react";
import { Check, Clock, Timer, Wrench, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBDT, formatTime12 } from "@/lib/format";
import type { Cell } from "@/server/availability";
import type { PitchAvailability } from "@/types/booking";
import type { SlotStatus } from "@/types";
import { Tabs } from "@/components/ui/Tabs";

// Status = color + icon + text, never color alone.
const statusLook: Record<SlotStatus, { label: string; icon: React.ElementType; badge: string }> = {
    AVAILABLE: { label: "Available", icon: Check, badge: "bg-emerald/25 text-evergreen" },
    HELD: { label: "Held", icon: Timer, badge: "bg-held-soft text-held" },
    BOOKED: { label: "Booked", icon: X, badge: "bg-booked-soft text-booked" },
    MAINTENANCE: { label: "Maintenance", icon: Wrench, badge: "bg-maint-soft text-maint" },
    PAST: { label: "Past", icon: Clock, badge: "bg-evergreen/5 text-evergreen/60" },
};

const HEAD = "px-3 py-2.5 text-left font-heading text-xs font-bold uppercase tracking-[0.14em] text-teal";
const GRID =
    "grid grid-cols-[minmax(0,1fr)_5rem_7.5rem] items-center md:grid-cols-[minmax(0,1fr)_8.5rem_9rem_8.5rem]";

export function SlotTable({
    pitches,
    selectedPitchId,
    selected,
    onToggle,
    showTabs = false,
}: {
    pitches: PitchAvailability[];
    selectedPitchId: string | null;
    selected: string[];
    onToggle: (pitchId: string, cell: Cell) => void;
    showTabs?: boolean;
}) {

    // Live "now" — ticks every 60s so a slot disappears the moment its start time
    // passes, without waiting for the 30s server auto-refresh in BookingFlow.
    const [now, setNow] = useState(() => Date.now());
    const [activeId, setActiveId] = useState<string | null>(
        selectedPitchId
    );
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Follow deep links and externally selected pitches.
    // Adjusted during render instead of in an effect — a props change now
    // re-renders once, with no cascading effect pass.
    const [prevExternalId, setPrevExternalId] = useState<string | null>(
        selectedPitchId
    );
    if (selectedPitchId !== prevExternalId) {
        setPrevExternalId(selectedPitchId);
        setActiveId(selectedPitchId);
    }

    // Only upcoming slots: drop PAST cells and any pitch left with no visible cells.
    const isPast = (c: Cell) =>
        c.status === "PAST" ||
        new Date(c.cellStart).getTime() <= now - 60_000;

    const visiblePitches = pitches
        .map((p) => ({
            ...p,
            cells: p.cells.filter((c) => !isPast(c)),
        }))
        .filter((p) => p.cells.length > 0);

    const active =
        visiblePitches.find((p) => p.id === activeId) ??
        visiblePitches[0];

    const tabsEnabled =
        showTabs && visiblePitches.length > 1;

    const shownPitches =
        tabsEnabled && active ? [active] : visiblePitches;

    if (visiblePitches.length === 0) {
        return (
            <div className="rounded-2xl border border-evergreen/10 bg-surface p-8 text-center">
                <p className="font-semibold text-evergreen">
                    All slots for today have already started.
                </p>
                <p className="mt-1 text-sm text-evergreen/70">
                    Pick a future date from the date picker above to see available slots.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">

            {tabsEnabled && (
                <Tabs
                    label="Choose a pitch"
                    items={visiblePitches.map((p) => ({
                        id: p.id,
                        label: p.name,
                    }))}
                    value={active?.id ?? ""}
                    onChange={setActiveId}
                    className="scrollbar-thin"
                />
            )}

            {/* Legend */}
            <ul className="flex flex-wrap gap-2" aria-label="Slot legend">
                {(["AVAILABLE", "HELD", "BOOKED", "MAINTENANCE"] as SlotStatus[]).map((s) => {
                    const { label, icon: Icon, badge } = statusLook[s];
                    return (
                        <li
                            key={s}
                            className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", badge)}
                        >
                            <Icon size={12} aria-hidden /> {label}
                        </li>
                    );
                })}
            </ul>

            {shownPitches.map((p) => (
                <section
                    key={p.id}
                    aria-label={p.name}
                    // With tabs, this is the panel the active tab's aria-controls points at.
                    {...(tabsEnabled
                        ? { role: "tabpanel", id: `panel-${p.id}`, "aria-labelledby": `tab-${p.id}` }
                        : {})}
                    className="overflow-hidden rounded-2xl border border-evergreen/10 bg-surface shadow-sm"
                >
                    <div className="flex flex-wrap items-baseline gap-x-3 px-4 pt-4">
                        <h2 className="text-base font-bold">{p.name}</h2>
                        <p className="text-sm text-evergreen/70">
                            {p.format}
                            {p.maxConsecutiveSlots > 1 && ` · up to ${p.maxConsecutiveSlots} consecutive slots`}
                        </p>
                    </div>

                    {/* Table head — 4 columns on desktop, 3 on mobile (Action hides; the row itself is tappable) */}
                    <div className={cn(GRID, "mt-3 border-b border-evergreen/10 bg-evergreen/[0.04]")}>
                        <div className={HEAD}>Time Slot</div>
                        <div className={HEAD}>Price</div>
                        <div className={HEAD}>Status</div>
                        <div className={cn(HEAD, "hidden md:block")}>Action</div>
                    </div>

                    <div className="divide-y divide-evergreen/10">
                        {p.cells.map((c) => (
                            <SlotRow
                                key={c.cellStart}
                                cell={c}
                                selected={selectedPitchId === p.id && selected.includes(c.cellStart)}
                                onToggle={() => onToggle(p.id, c)}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

function SlotRow({ cell, selected, onToggle }: { cell: Cell; selected: boolean; onToggle: () => void }) {
    const available = cell.status === "AVAILABLE";
    const look = statusLook[cell.status];
    const StatusIcon = selected ? Check : look.icon;

    const isSurcharge = cell.hasDiscount && cell.price > cell.originalPrice;
    const priceColor = isSurcharge ? "text-held" : "text-teal";

    const priceLabel = cell.hasDiscount
        ? `${formatBDT(cell.originalPrice)} ${isSurcharge ? "marked up to" : "discounted to"} ${formatBDT(cell.price)}`
        : formatBDT(cell.price);

    const head = (
        <>
            <div className="min-w-0 px-3 py-3">
                <p className={cn("font-heading text-sm font-bold tabular-nums sm:text-base", selected && "text-teal")}>
                    {formatTime12(cell.start)} - {formatTime12(cell.end)}
                </p>
            </div>
            <div className="px-3 py-3 text-right md:text-left">
                {cell.hasDiscount ? (
                    <span className="flex flex-col items-end leading-tight tabular-nums md:items-start">
                        <span className={cn("text-[10px] font-medium line-through sm:text-xs", selected ? "text-teal/60" : "text-evergreen/50")}>
                            {formatBDT(cell.originalPrice)}
                        </span>
                        <span className={cn("text-sm font-bold tabular-nums sm:text-base", selected ? "text-teal" : priceColor)}>
                            {formatBDT(cell.price)}
                        </span>
                    </span>
                ) : (
                    <span className={cn("text-sm font-semibold tabular-nums sm:text-base", selected && "text-teal")}>
                        {formatBDT(cell.price)}
                    </span>
                )}
            </div>
            <div className="px-2 py-3 sm:px-3">
                <span
                    className={cn(
                        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
                        selected ? "bg-teal text-white" : look.badge
                    )}
                >
                    <StatusIcon size={12} aria-hidden /> {selected ? "Selected" : look.label}
                </span>
            </div>
        </>
    );

    // Available rows are tappable; the rest render as plain rows (Action shows why).
    if (!available) {
        return (
            <div className={cn(GRID, "bg-evergreen/[0.03] text-evergreen/60")}>
                {head}
                <div className="hidden px-3 py-3 text-sm font-medium md:block">{look.label}</div>
            </div>
        );
    }

    return (
        <div
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${formatTime12(cell.start)} to ${formatTime12(cell.end)}, ${priceLabel}. ${selected ? "Selected" : "Available — activate to select"}`}
            onClick={onToggle}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle();
                }
            }}
            className={cn(
                GRID,
                "group cursor-pointer transition-colors",
                selected ? "bg-mint/70 ring-2 ring-inset ring-teal" : "hover:bg-mint/50"
            )}
        >
            {head}
            <div className="hidden px-3 py-3 md:block">
                {selected ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-teal/15 px-3 py-2 text-sm font-bold text-teal">
                        <Check size={14} aria-hidden /> Selected
                    </span>
                ) : (
                    // Visual cue only: the whole row is the button, so no nested control here.
                    <span
                        aria-hidden
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-teal px-3 font-heading text-sm font-semibold text-white transition-colors group-hover:bg-evergreen"
                    >
                        Book Now
                    </span>
                )}
            </div>
        </div>
    );
}