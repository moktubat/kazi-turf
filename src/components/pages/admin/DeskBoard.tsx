// src/components/admin/DeskBoard.tsx
"use client";
import { useRef } from "react";
import { LogIn, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBDT } from "@/lib/format";
import type { BoardCell, BoardPitch } from "@/types/admin";
import { slotLook } from "../booking/SlotChip";

const LONG_PRESS_MS = 500;

function Cell({
    cell,
    onOpen,
    onMore,
}: {
    cell: BoardCell;
    onOpen: () => void;
    onMore: () => void;
}) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fired = useRef(false);

    const bk = cell.booking;
    const available = cell.status === "AVAILABLE";
    const interactive = available || !!bk || cell.status === "MAINTENANCE";
    const checkedIn = bk?.bookingStatus === "CHECKED_IN";
    const look = slotLook[cell.status];
    const Icon = checkedIn ? LogIn : look.icon;
    const label = checkedIn ? "Checked in" : look.label;

    const clear = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    };
    const start = () => {
        if (!available) return;
        fired.current = false;
        clear();
        timer.current = setTimeout(() => {
            fired.current = true;
            onMore(); // long-press opens the maintenance drawer
        }, LONG_PRESS_MS);
    };

    return (
        <div className="relative">
            <button
                type="button"
                disabled={!interactive}
                aria-label={`${cell.start} to ${cell.end}, ${label}${bk ? `, ${bk.customerName}, ${bk.code}` : ""}${cell.reason ? `, ${cell.reason}` : ""
                    }`}
                onPointerDown={start}
                onPointerUp={clear}
                onPointerLeave={clear}
                onPointerCancel={clear}
                onContextMenu={(e) => {
                    if (available) {
                        e.preventDefault();
                        onMore();
                    }
                }}
                onClick={() => {
                    if (fired.current) {
                        fired.current = false;
                        return;
                    }
                    onOpen();
                }}
                className={cn(
                    "flex min-h-[5.75rem] w-full flex-col items-start justify-between rounded-xl border-2 px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed",
                    checkedIn ? "border-teal/40 bg-mint text-teal" : look.cls
                )}
            >
                <span className="font-heading text-base font-bold leading-tight">{cell.start}</span>
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

            {available && (
                <button
                    type="button"
                    aria-label={`More actions for ${cell.start}`}
                    onClick={onMore}
                    className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-xl text-evergreen/70 hover:bg-emerald/30"
                >
                    <MoreHorizontal size={18} aria-hidden />
                </button>
            )}
        </div>
    );
}

export function DeskBoard({
    pitches,
    onAvailable,
    onBooking,
    onBlock,
}: {
    pitches: BoardPitch[];
    onAvailable: (pitchId: string, cell: BoardCell) => void;
    onBooking: (code: string) => void;
    onBlock: (pitchId: string, cell: BoardCell) => void;
}) {
    return (
        <div className="space-y-6">
            <ul className="flex flex-wrap gap-2 text-xs font-semibold" aria-label="Board legend">
                {[
                    ["Available: tap to add a walk-in", "border-emerald bg-emerald/15"],
                    ["Held (online, unpaid)", "border-held/40 bg-held-soft text-held"],
                    ["Booked", "border-booked/40 bg-booked-soft text-booked"],
                    ["Checked in", "border-teal/40 bg-mint text-teal"],
                    ["Maintenance", "border-maint/40 bg-maint-soft text-maint"],
                ].map(([text, cls]) => (
                    <li key={text} className={`rounded-full border px-2.5 py-1 ${cls}`}>
                        {text}
                    </li>
                ))}
            </ul>

            {pitches.map((p) => (
                <section key={p.id} aria-label={p.name}>
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                        <h3 className="text-base font-bold">{p.name}</h3>
                        <p className="text-sm text-evergreen/70">
                            {p.sport} · {p.format}
                        </p>
                    </div>
                    <div className="overflow-x-auto pb-2">
                        <div className="grid grid-flow-col auto-cols-[7rem] gap-2">
                            {p.cells.map((c) => (
                                <Cell
                                    key={c.cellStart}
                                    cell={c}
                                    onOpen={() => {
                                        if (c.status === "AVAILABLE") onAvailable(p.id, c);
                                        else if (c.booking) onBooking(c.booking.code);
                                        else if (c.status === "MAINTENANCE") onBlock(p.id, c);
                                    }}
                                    onMore={() => onBlock(p.id, c)}
                                />
                            ))}
                        </div>
                    </div>
                </section>
            ))}
        </div>
    );
}