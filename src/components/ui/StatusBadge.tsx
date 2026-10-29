// Status = color + icon + text. Booking badges are pills; payment badges are
// square-cornered with a border so the two never look alike.
import {
    CheckCircle2, Clock, XCircle, LogIn, Flag, Ban, Wallet, BadgeCheck,
    AlertTriangle, RotateCcw, CircleDashed,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { BookingStatus, PaymentStatus } from "@/types";

const bookingMap: Record<BookingStatus, { label: string; icon: React.ElementType; cls: string }> = {
    PENDING_PAYMENT: { label: "Awaiting payment", icon: Clock, cls: "bg-held-soft text-held" },
    CONFIRMED: { label: "Confirmed", icon: CheckCircle2, cls: "bg-emerald/25 text-evergreen" },
    CHECKED_IN: { label: "Checked in", icon: LogIn, cls: "bg-teal text-white" },
    COMPLETED: { label: "Completed", icon: Flag, cls: "bg-mint text-teal" },
    CANCELLED: { label: "Cancelled", icon: Ban, cls: "bg-booked-soft text-booked" },
    EXPIRED: { label: "Expired", icon: XCircle, cls: "bg-maint-soft text-maint" },
};

const paymentMap: Record<PaymentStatus, { label: string; icon: React.ElementType; cls: string }> = {
    NOT_STARTED: { label: "Not paid", icon: CircleDashed, cls: "border-maint text-maint" },
    PENDING: { label: "Payment processing", icon: Clock, cls: "border-held text-held" },
    PARTIALLY_PAID: { label: "Advance paid", icon: Wallet, cls: "border-teal text-teal" },
    PAID: { label: "Fully paid", icon: BadgeCheck, cls: "border-teal bg-teal text-white" },
    FAILED: { label: "Payment failed", icon: AlertTriangle, cls: "border-booked text-booked" },
    CANCELLED: { label: "Payment cancelled", icon: Ban, cls: "border-maint text-maint" },
    REFUND_PENDING: { label: "Refund pending", icon: RotateCcw, cls: "border-held text-held" },
    REFUNDED: { label: "Refunded", icon: RotateCcw, cls: "border-teal text-teal" },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
    const { label, icon: Icon, cls } = bookingMap[status];
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", cls)}>
            <Icon size={14} aria-hidden /> {label}
        </span>
    );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
    const { label, icon: Icon, cls } = paymentMap[status];
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold", cls)}>
            <Icon size={14} aria-hidden /> {label}
        </span>
    );
}