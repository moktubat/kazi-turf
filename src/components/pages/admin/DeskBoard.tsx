"use client";
import { useState } from "react";
import { CalendarPlus, LogIn, LogOut, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBDT, formatTime12 } from "@/lib/format";
import type { BoardCell, BoardPitch } from "@/types/admin";
import { slotLook } from "../booking/SlotChip";

/** Arrow keys / Home / End move the selection in a tab list or radio group and focus the new item. */
function moveWithKeys<T extends string>(e: React.KeyboardEvent, ids: T[], current: T, select: (id: T) => void, domId: (id: T) => string) {
    const i = ids.indexOf(current);
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    else return;
    e.preventDefault();
    select(ids[next]);
    document.getElementById(domId(ids[next]))?.focus();
}

function Cell({ cell, onOpen }: { cell: BoardCell; onOpen: () => void }) {
    const bk = cell.booking;
    const available = cell.status === "AVAILABLE";
    // Tappable: open slots, anything with a booking, staff blocks and manual holds.
    // An online HELD cell (customer is paying) has a booking attached and opens that instead.
    const interactive =
        available || !!bk || cell.status === "MAINTENANCE" || (cell.status === "HELD" && !bk);
    const checkedIn = bk?.bookingStatus === "CHECKED_IN";
    const checkedOut = bk?.bookingStatus === "COMPLETED";
    const look = slotLook[cell.status];
    const Icon = checkedOut ? LogOut : checkedIn ? LogIn : look.icon;
    // Tell a staff hold apart from a customer's online hold (they pay within minutes).
    const label = checkedOut
        ? "Checked out"
        : checkedIn
            ? "Checked in"
            : cell.status === "HELD"
                ? bk ? "Held · customer paying" : "Held by staff"
                : look.label;

    return (
        // The card hugs its text and padding (w-fit), so it is only as wide as its
        // content. min-w-0 / max-w-full keep the truncating spans working when a
        // narrow screen squeezes a column.
        <button
            type="button"
            disabled={!interactive}
            aria-label={`${formatTime12(cell.start)} to ${formatTime12(cell.end)}, ${label}${bk ? `, ${bk.customerName}, ${bk.code}` : ""}${cell.reason ? `, ${cell.reason}` : ""}`}
            onClick={onOpen}
            className={cn(
                "flex min-h-[5.75rem] w-fit min-w-0 max-w-full flex-col items-start justify-between rounded-xl border-2 px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed",
                checkedOut ? "border-teal/60 bg-teal/15 text-teal" : checkedIn ? "border-teal/40 bg-mint text-teal" : look.cls
            )}
        >
            <span className="font-heading text-base font-bold leading-tight">{formatTime12(cell.start)}</span>
            <span className="flex items-center gap-1 text-xs font-semibold">
                <Icon size={12} aria-hidden /> {label}
            </span>
            {bk ? (
                <span className="w-full min-w-0">
                    <span className="block truncate text-xs font-medium">{bk.customerName}</span>
                    {bk.balanceDue > 0 && <span className="block text-xs font-bold">Due {formatBDT(bk.balanceDue)}</span>}
                </span>
            ) : cell.reason ? (
                <span className="block w-full truncate text-xs">{cell.reason}</span>
            ) : (
                <span className="text-xs font-semibold">{formatBDT(cell.price)}</span>
            )}
        </button>
    );
}

const MODES: { id: "book" | "manage"; label: string; hint: string; icon: React.ElementType }[] = [
    { id: "book", label: "Add walk-in booking", hint: "Tap an open slot to book it for a customer at the counter. To hold or block a slot instead, switch to Hold or maintenance.", icon: CalendarPlus },
    {
        id: "manage",
        label: "Hold or maintenance",
        hint: "Tap a slot to hold it or block it for maintenance. No booking is created and customers cannot book it. Tap a held or maintenance slot to release it.",
        icon: Wrench,
    },
];

export function DeskBoard({
    pitches,
    mode,
    onModeChange,
    onAvailable,
    onBooking,
    onBlock,
}: {
    pitches: BoardPitch[];
    mode: "book" | "manage";
    onModeChange: (m: "book" | "manage") => void;
    onAvailable: (pitchId: string, cell: BoardCell) => void;
    onBooking: (code: string) => void;
    onBlock: (pitchId: string, cell: BoardCell) => void;
}) {
    const [activeId, setActiveId] = useState<string>(pitches[0]?.id ?? "");
    const active = pitches.find((p) => p.id === activeId) ?? pitches[0];
    const current = MODES.find((m) => m.id === mode) ?? MODES[0];

    if (!active) return null;

    // Passed hours (status PAST, no booking) are skipped: they only lengthen the
    // board. Earlier bookings keep showing — they carry a claim, so their status
    // is BOOKED / MAINTENANCE etc., never PAST.
    const cells = active.cells.filter((c) => c.status !== "PAST");

    return (
        <div className="space-y-4">
            {/* What does a tap do? */}
            <div className="space-y-2">
                <p className="text-sm font-semibold">Tap a slot to:</p>
                <div role="radiogroup" aria-label="Tap a slot to" className="grid gap-2 sm:grid-cols-2">
                    {MODES.map((m) => {
                        const on = m.id === mode;
                        const Icon = m.icon;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                role="radio"
                                id={`desk-mode-${m.id}`}
                                aria-checked={on}
                                tabIndex={on ? 0 : -1}
                                onClick={() => onModeChange(m.id)}
                                onKeyDown={(e) => moveWithKeys(e, MODES.map((x) => x.id), mode, onModeChange, (id) => `desk-mode-${id}`)}
                                className={cn(
                                    "flex min-h-12 items-center gap-2 rounded-xl border-2 px-4 text-left font-heading text-sm font-bold transition-colors",
                                    on ? "border-teal bg-teal text-white shadow-md" : "border-evergreen/15 bg-surface text-evergreen hover:border-teal"
                                )}
                            >
                                <Icon size={18} aria-hidden /> {m.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs text-evergreen/70" aria-live="polite">{current.hint}</p>
            </div>

            {/* Legend */}
            <ul className="flex flex-wrap gap-2 text-xs font-semibold" aria-label="Board legend">
                {[
                    [mode === "manage" ? "Available: tap to hold or block" : "Available: tap to add a walk-in", "border-emerald bg-emerald/15"],
                    ["Held (by staff, or a customer paying online)", "border-held/40 bg-held-soft text-held"],
                    ["Booked", "border-booked/40 bg-booked-soft text-booked"],
                    ["Checked in", "border-teal/40 bg-mint text-teal"],
                    ["Checked out (payment complete)", "border-teal/60 bg-teal/15 text-teal"],
                    ["Maintenance", "border-maint/40 bg-maint-soft text-maint"],
                ].map(([text, cls]) => (
                    <li key={text} className={`rounded-full border px-2.5 py-1 ${cls}`}>
                        {text}
                    </li>
                ))}
            </ul>

            {/* Pitch selector — content-width tabs, horizontal scroll when overflow */}
            {pitches.length > 1 && (
                <div
                    role="tablist"
                    aria-label="Select pitch"
                    className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1"
                >
                    <div className="flex w-max gap-2">
                        {pitches.map((p) => {
                            const isActive = p.id === active.id;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    role="tab"
                                    id={`desk-tab-${p.id}`}
                                    aria-selected={isActive}
                                    aria-controls={isActive ? `panel-${p.id}` : undefined}
                                    tabIndex={isActive ? 0 : -1}
                                    onClick={() => setActiveId(p.id)}
                                    onKeyDown={(e) => moveWithKeys(e, pitches.map((x) => x.id), active.id, setActiveId, (id) => `desk-tab-${id}`)}
                                    className={cn(
                                        "flex min-h-12 shrink-0 flex-col items-start gap-0.5 rounded-xl border-2 px-4 py-2 text-left transition-all",
                                        isActive
                                            ? "border-teal bg-teal text-white shadow-md"
                                            : "border-evergreen/15 bg-surface text-evergreen hover:border-teal hover:bg-mint/40"
                                    )}
                                >
                                    <span className="whitespace-nowrap font-heading text-sm font-bold">{p.name}</span>
                                    <span
                                        className={cn(
                                            "whitespace-nowrap text-xs",
                                            isActive ? "text-white/80" : "text-evergreen/60"
                                        )}
                                    >
                                        {p.sport} · {p.format}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Active pitch only */}
            <section
                key={active.id}
                role="tabpanel"
                id={`panel-${active.id}`}
                {...(pitches.length > 1 ? { "aria-labelledby": `desk-tab-${active.id}` } : { "aria-label": active.name })}
                className="rounded-2xl border border-evergreen/10 bg-surface p-4 shadow-sm"
            >
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                    {/* h2: the page's h1 is "Staff Desk"; there is no h2 in between */}
                    <h2 className="text-base font-bold">{active.name}</h2>
                    <p className="text-sm text-evergreen/70">
                        {active.sport} · {active.format}
                    </p>
                </div>
                {/* Slots flow left to right and wrap onto new rows — each card is
                    only as wide as its text and cards sit right next to each other
                    with a tight 8px gap: no uneven holes, no horizontal scrolling. */}
                <div className="flex flex-wrap gap-2">
                    {cells.map((c) => (
                        <Cell
                            key={c.cellStart}
                            cell={c}
                            onOpen={() => {
                                // A customer's booking or online hold always opens the booking: staff
                                // slot management never touches customer bookings.
                                if (c.booking) onBooking(c.booking.code);
                                else if (c.status === "AVAILABLE") (mode === "manage" ? onBlock : onAvailable)(active.id, c);
                                else if (c.status === "MAINTENANCE" || c.status === "HELD") onBlock(active.id, c);
                            }}
                        />
                    ))}
                </div>
                {cells.length === 0 && (
                    <p className="text-sm text-evergreen/70">No slots left to show for this day.</p>
                )}
            </section>
        </div>
    );
}