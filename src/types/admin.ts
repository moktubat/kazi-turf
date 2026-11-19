import type { BookingStatus, PaymentStatus, SlotStatus } from "@/types";
import type { ChangeKind } from "@/types/account";
import type { BookingDto } from "@/types/booking";
import type { AuditAction, AuditMeta } from "@/types/ops";
import type { Cell } from "@/server/availability";

export type CheckInState = "VALID" | "OUTSIDE_WINDOW" | "BLOCKED";

export interface PaymentDto {
    id: string;
    provider: "BKASH" | "CASH";
    kind: "ADVANCE" | "BALANCE";
    amount: number;
    status: "PENDING" | "SUCCESS" | "FAILED";
    reference: string | null;
    at: string;
}

export interface AdminBookingDto extends BookingDto {
    customerName: string;
    phone: string;
    source: "online" | "counter";
    checkedInAt: string | null;
    cancelReason: string | null;
    /** Staff note from the walk-in form ("Paid", "Unpaid", …). */
    note: string | null;
    payments: PaymentDto[];
    changeRequest: { kind: ChangeKind; reason: string; createdAt: string } | null;
    checkIn: { state: CheckInState; message: string; opensAt: string };
    can: {
        checkIn: boolean;
        overrideCheckIn: boolean;
        collectBalance: boolean;
        cancel: boolean;
        refund: boolean;
        handleRequest: boolean;
        /** Staff may add or change the counter discount (Booked or Checked in, no payment in flight). */
        editDiscount: boolean;
        /** Staff may add or change the staff note (Booked or Checked in). */
        editNote: boolean;
        /** Staff may undo a check-in: the booking goes back to Booked. */
        undoCheckIn: boolean;
    };
    /** The discount as staff entered it (null when none) — prefills the panel's discount form. */
    discountType: "FIXED" | "PERCENT" | null;
    discountValue: number | null;
    /** The venue's VAT mode, so the discount form previews totals exactly like the server. */
    vatMode: "inclusive" | "exclusive";
    vatRegistrationNo: string;
}

export interface AuditEntryDto {
    id: string;
    action: AuditAction;
    actorName: string;
    at: string;
    meta: AuditMeta;
}

export interface BoardBooking {
    code: string;
    customerName: string;
    bookingStatus: BookingStatus;
    paymentStatus: PaymentStatus;
    balanceDue: number;
}

export interface BoardCell extends Cell {
    reason?: string;
    booking?: BoardBooking;
}

export interface BoardPitch {
    id: string;
    name: string;
    sport: string;
    format: string;
    maxConsecutiveSlots: number;
    cells: BoardCell[];
}

export interface BoardResponse {
    branchId: string;
    branchName: string;
    date: string;
    updatedAt: string;
    pitches: BoardPitch[];
    stats: {
        arrivalsPending: number;
        checkedIn: number;
        /** Kept for the API; the desk now shows the sales/advance/pending trio below. */
        cashCollected: number;
        /** Gross total of the day's active bookings (confirmed + checked in + completed). */
        totalSales: number;
        /** CASH payments of kind ADVANCE verified today. */
        advanceCollected: number;
        /** What is still to be collected today: totalSales minus cash collected today. */
        pendingCash: number;
        openRequests: number;
    };
}

export type { SlotStatus };