import { Check, Timer, X, Wrench, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBDT } from "@/lib/format";
import type { Cell } from "@/server/availability";
import type { SlotStatus } from "@/types";

// Status = color + icon + text, never color alone.
export const slotLook: Record<SlotStatus, { label: string; icon: React.ElementType; cls: string }> = {
    AVAILABLE: { label: "Available", icon: Check, cls: "border-emerald bg-emerald/15 hover:bg-emerald/30" },
    HELD: { label: "Held", icon: Timer, cls: "border-held/40 bg-held-soft text-held" },
    BOOKED: { label: "Booked", icon: X, cls: "border-booked/40 bg-booked-soft text-booked" },
    MAINTENANCE: { label: "Maintenance", icon: Wrench, cls: "border-maint/40 bg-maint-soft text-maint" },
    PAST: { label: "Past", icon: Clock, cls: "border-evergreen/10 bg-evergreen/5 text-evergreen/60" },
};

export function SlotChip({
    cell,
    selected,
    onSelect,
}: {
    cell: Cell;
    selected: boolean;
    onSelect: () => void;
}) {
    const available = cell.status === "AVAILABLE";
    const look = slotLook[cell.status];
    const Icon = selected ? Check : look.icon;

    return (
        <button
            type="button"
            disabled={!available}
            aria-pressed={available ? selected : undefined}
            aria-label={`${cell.start} to ${cell.end}, ${formatBDT(cell.price)}, ${selected ? "Selected" : look.label}`}
            onClick={onSelect}
            className={cn(
                "flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center transition-colors",
                "disabled:cursor-not-allowed",
                selected ? "border-teal bg-teal text-white" : look.cls
            )}
        >
            <span className="font-heading text-base font-bold leading-tight">{cell.start}</span>
            <span className="text-sm font-semibold">{formatBDT(cell.price)}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs font-medium">
                <Icon size={12} aria-hidden /> {selected ? "Selected" : look.label}
            </span>
        </button>
    );
}