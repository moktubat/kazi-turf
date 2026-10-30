import { ChevronRight } from "lucide-react";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { formatDateLong } from "@/lib/format";
import type { AccountBookingDto } from "@/types/account";

export function BookingRow({ b, onOpen }: { b: AccountBookingDto; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`Open booking ${b.code}, ${formatDateLong(b.date)}, ${b.start} to ${b.end}`}
            className="flex w-full items-center gap-3 rounded-2xl border border-evergreen/10 bg-white p-4 text-left hover:border-teal"
        >
            <div className="min-w-0 flex-1 space-y-2">
                <p className="font-heading font-bold">
                    {formatDateLong(b.date)} · {b.start}–{b.end}
                </p>
                <p className="truncate text-sm text-evergreen/80">
                    {b.branchName} · {b.pitchName} · <span className="font-mono">{b.code}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                    <BookingStatusBadge status={b.bookingStatus} />
                    <PaymentStatusBadge status={b.paymentStatus} />
                </div>
            </div>
            <ChevronRight size={20} aria-hidden className="shrink-0 text-evergreen/50" />
        </button>
    );
}