import type { BookingStatus, PaymentStatus } from "@/types";
import type { Cell } from "@/server/availability";

export interface Booking {
    id: string;
    bookingCode: string;
    customerId: string;
    customerName: string;
    phone: string;
    branchId: string;
    pitchId: string;
    date: string; // Dhaka calendar date of first slot
    startAt: string; // ISO UTC
    endAt: string; // ISO UTC
    cellStarts: string[];
    slotCount: number;
    bookingStatus: BookingStatus;
    paymentStatus: PaymentStatus;
    subtotal: number;
    vatAmount: number;
    total: number;
    advanceAmount: number;
    balanceAmount: number;
    advancePercentSnapshot: number;
    vatRatePercentSnapshot: number | null;
    source: "online" | "counter";
    holdExpiresAt: string; // ISO UTC, server-authoritative
    createdAt: string;
}

/** What the browser is allowed to see. */
export interface BookingDto {
    code: string;
    bookingStatus: BookingStatus;
    paymentStatus: PaymentStatus;
    branchId: string;
    branchName: string;
    branchAddress: string;
    branchMapUrl: string;
    branchPhone: string;
    pitchId: string;
    pitchName: string;
    sport: string;
    date: string;
    start: string;
    end: string;
    startAt: string;
    endAt: string;
    slotCount: number;
    subtotal: number;
    vatAmount: number;
    vatRatePercent: number | null;
    total: number;
    advanceAmount: number;
    advancePaid: number;
    balanceAmount: number;
    balanceDue: number;
    holdExpiresAt: string;
    holdActive: boolean;
    serverNow: string;
    checkInOpensMinutes: number;
}

export interface PitchAvailability {
    id: string;
    name: string;
    sport: string;
    format: string;
    maxConsecutiveSlots: number;
    cells: Cell[];
}

export interface AvailabilityResponse {
    branchId: string;
    sport: string;
    date: string;
    updatedAt: string;
    pitches: PitchAvailability[];
    nextAvailableDate: string | null;
}

export interface Inquiry {
    id: string;
    name: string;
    contact: string;
    message: string;
    status: "NEW" | "HANDLED";
    createdAt: string;
}