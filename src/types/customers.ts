import type { BookingStatus, PaymentStatus } from "@/types";

/** Booking and money totals for one customer. Amounts are taka. */
export interface CustomerStats {
    bookings: number;
    confirmed: number; // confirmed, checked in or completed (checked out)
    pending: number; // awaiting payment
    cancelled: number;
    expired: number;
    paid: number; // money received (bKash + cash), including bookings later refunded
    outstanding: number; // balance still due at the venue on live bookings
    refunds: number; // bookings with a refund pending or refunded
    refundPending: number; // money received on bookings whose refund is still pending
    refunded: number; // money received on bookings marked refunded
    lastBookingAt: string | null; // start time of the most recent booking
}

export interface CustomerRow {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    emailVerified: boolean;
    status: "ACTIVE" | "DISABLED";
    registeredAt: string;
    stats: CustomerStats;
}

export interface CustomerPayment {
    id: string;
    kind: "ADVANCE" | "BALANCE";
    provider: "BKASH" | "CASH";
    amount: number;
    status: "PENDING" | "SUCCESS" | "FAILED";
    reference: string | null;
    at: string;
}

export interface CustomerBooking {
    code: string;
    date: string;
    start: string;
    end: string;
    startAt: string;
    pitchName: string;
    sport: string;
    source: "online" | "counter";
    bookingStatus: BookingStatus;
    paymentStatus: PaymentStatus;
    total: number;
    paid: number;
    balanceDue: number;
    createdAt: string;
    payments: CustomerPayment[];
}

export interface CustomerFilters {
    q?: string; // name, phone or email
    bookingStatus?: BookingStatus; // customers with at least one booking in this status
    from?: string; // ...dated on or after (YYYY-MM-DD)
    to?: string; // ...dated on or before
    /** Page number for the customer list (1-based). The list is 25 per page. */
    page?: number;
}