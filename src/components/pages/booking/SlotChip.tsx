import { Check, Timer, X, Wrench, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBDT, formatTime12 } from "@/lib/format";
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

    const isSurcharge = cell.hasDiscount && cell.price > cell.originalPrice;
    const adjustedColor = isSurcharge ? "text-held" : "text-teal";

    const priceLabel = cell.hasDiscount
        ? `${formatBDT(cell.originalPrice)} ${isSurcharge ? "marked up to" : "discounted to"} ${formatBDT(cell.price)}`
        : formatBDT(cell.price);

    return (
        <button
            type="button"
            disabled={!available}
            aria-pressed={available ? selected : undefined}
            aria-label={`${formatTime12(cell.start)} to ${formatTime12(cell.end)}, ${priceLabel}, ${selected ? "Selected" : look.label}`}
            onClick={onSelect}
            className={cn(
                "flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center rounded-xl border-2 px-1.5 py-2 text-center transition-colors",
                "disabled:cursor-not-allowed",
                selected ? "border-teal bg-teal text-white shadow-md" : look.cls
            )}
        >
            <span className="font-heading text-sm font-bold leading-tight tabular-nums sm:text-base">
                {formatTime12(cell.start)}
            </span>

            {cell.hasDiscount ? (
                <span className="flex flex-col items-center leading-tight tabular-nums">
                    <span className={`text-[10px] font-medium line-through sm:text-xs ${selected ? "text-white/70" : "text-evergreen/50"}`}>
                        {formatBDT(cell.originalPrice)}
                    </span>
                    <span className={`text-sm font-bold tabular-nums sm:text-base ${selected ? "text-white" : adjustedColor}`}>
                        {formatBDT(cell.price)}
                    </span>
                </span>
            ) : (
                <span className="text-sm font-semibold tabular-nums sm:text-base">
                    {formatBDT(cell.price)}
                </span>
            )}

            <span className="mt-0.5 flex items-center gap-1 text-xs font-medium">
                <Icon size={12} aria-hidden /> {selected ? "Selected" : look.label}
            </span>
        </button>
    );
}