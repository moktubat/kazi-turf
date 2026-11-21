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
    date: string;
    startAt: string;
    endAt: string;
    cellStarts: string[];
    slotCount: number;
    bookingStatus: BookingStatus;
    paymentStatus: PaymentStatus;
    subtotal: number;
    // Price before any date-range discount/surcharge. Optional so bookings made
    // before this field existed still load; treat missing as "same as subtotal".
    originalSubtotal?: number;
    vatAmount: number;
    // Counter discount staff gave on a walk-in, in taka, taken off the subtotal before VAT.
    // total is already net of it. Optional: older bookings have none (= 0).
    discountAmount?: number;
    discountType?: "FIXED" | "PERCENT" | null;
    discountValue?: number | null;
    // Additional charge staff added on a walk-in or later from the booking panel (taka,
    // ADDED to the subtotal before VAT, e.g. drinks or damage). total is already net of
    // it. Optional: older bookings have none (= 0).
    additionalChargeAmount?: number;
    additionalChargeReason?: string | null;
    total: number;
    advanceAmount: number;
    balanceAmount: number;
    advancePercentSnapshot: number;
    vatRatePercentSnapshot: number | null;
    source: "online" | "counter";
    holdExpiresAt: string;
    createdAt: string;

    // IP the booking was created from — used for IP-based holds cap (audit finding CONF-15).
    // Null for counter (walk-in) bookings created by staff.
    createdFromIp?: string | null;

    // Check-in and cancellation information
    checkedInAt?: string | null;
    cancelledAt?: string | null;
    cancelReason?: string | null;

    // Staff note added at the counter (walk-ins), e.g. "Paid" or "Unpaid".
    note?: string | null;
}

/** What the browser is allowed to see. */
export interface BookingDto {
    code: string;
    bookingStatus: BookingStatus;
    paymentStatus: PaymentStatus;
    venueId: string;
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
    // Pre-adjustment price, so the UI can show "৳3,500 → ৳2,700".
    originalSubtotal: number;
    vatAmount: number;
    vatRatePercent: number | null;
    /** Counter discount in taka (0 when none). subtotal − discount (+ charge) (+ VAT) = total. */
    discountAmount: number;
    /** Additional charge in taka ADDED to the total (0 when none), with its optional reason. */
    additionalChargeAmount: number;
    additionalChargeReason: string | null;
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
    venueId: string;
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