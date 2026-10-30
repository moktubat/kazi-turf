import type { BookingDto } from "@/types/booking";

export type ChangeKind = "CANCEL" | "RESCHEDULE";

export interface ChangeRequest {
    id: string;
    bookingCode: string;
    customerId: string;
    kind: ChangeKind;
    reason: string;
    status: "OPEN" | "HANDLED";
    createdAt: string;
}

export interface ChangeRequestInfo {
    kind: ChangeKind;
    status: "OPEN" | "HANDLED";
    createdAt: string;
}

export interface AccountBookingDto extends BookingDto {
    paymentReference: string | null; // TODO(payments): filled from Payment in Batch 6
    changeRequest: ChangeRequestInfo | null;
    canRequestChange: boolean;
}