import { ChevronRight } from "lucide-react";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { formatBDT, formatDateLong, formatDateShort, formatTime12 } from "@/lib/format";
import type { AccountBookingDto } from "@/types/account";

export function BookingRow({ b, onOpen }: { b: AccountBookingDto; onOpen: () => void }) {
    const d = formatDateShort(b.date);

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`Open booking ${b.code}, ${formatDateLong(b.date)}, ${formatTime12(b.start)} to ${formatTime12(b.end)}`}
            className="group flex w-full items-center gap-3 rounded-xl border border-evergreen/10 bg-surface p-3.5 text-left shadow-sm transition-all hover:border-teal/40 hover:shadow-md sm:gap-4 sm:p-4"
        >
            {/* Date block */}
            <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-mint/60 py-2 text-center sm:w-16">
                <span className="font-heading text-base font-extrabold leading-none text-teal">
                    {d.day}
                </span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-evergreen/60">
                    {d.month}
                </span>
            </div>

            {/* Main info */}
            <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="font-heading text-sm font-bold">
                        {formatTime12(b.start)}–{formatTime12(b.end)}
                    </p>
                    <span className="font-mono text-xs text-evergreen/60">{b.code}</span>
                </div>
                <p className="truncate text-sm text-evergreen/80">
                    {b.pitchName} · {b.sport}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    <BookingStatusBadge status={b.bookingStatus} />
                    <PaymentStatusBadge status={b.paymentStatus} />
                </div>
            </div>

            {/* Amount + chevron */}
            <div className="flex shrink-0 items-center gap-2">
                <div className="hidden text-right sm:block">
                    <p className="font-heading text-sm font-bold">{formatBDT(b.total)}</p>
                    {b.balanceDue > 0 && (
                        <p className="text-[11px] font-medium text-held">Due {formatBDT(b.balanceDue)}</p>
                    )}
                </div>
                <span className="grid size-8 place-items-center rounded-full bg-mint/40 text-evergreen/50 transition-colors group-hover:bg-teal group-hover:text-surface">
                    <ChevronRight size={16} aria-hidden />
                </span>
            </div>
        </button>
    );
}