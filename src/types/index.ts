export type Role = "CUSTOMER" | "STAFF" | "SUPER_ADMIN";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export type BranchStatus = "ACTIVE" | "DISABLED";

export interface SportConfig {
  id: string;       // slug: "football", "cricket"
  name: string;     // display name: "Football"
  image: string;    // path to bg image: "/sports/football.jpg"
  active: boolean;  // shown in hero tabs when true
  // Sport-wise advance payment, any whole 0–100 (0 = no advance, pay at the venue).
  // Optional: sports saved before this existed fall back to Policies' venue-wide values.
  advancePercent?: number;       // slots starting 6 AM–12 AM
  nightAdvancePercent?: number;  // slots starting 12 AM–6 AM
}

export interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  whatsapp: string;
  mapUrl: string;
  hours: string;
  status: "ACTIVE" | "DISABLED";
  sports: string[];
  sportConfigs: SportConfig[];
}

export interface Pitch {
  id: string;
  branchId: string;
  name: string;
  sport: string;
  format: string;
  dimensions: string;
  surface: string;
  openTime: string;     // always "00:00" — turf is open 24 hours
  closeTime: string;    // always "24:00"
  slotMinutes: number;  // per-pitch slot length (45 / 60 / 75 / 90 / 105 / 120)
  maxConsecutiveSlots: number;
  facilities: string[];
  image: string | null;
  status: "ACTIVE" | "DISABLED";
}

export type RateTier = "Off-peak" | "Peak";
export type DiscountType = "PERCENT" | "FIXED";

export interface PricingRule {
  id: string;
  pitchId: string;
  days: number[];
  startTime: string;
  endTime: string;
  pricePerSlot: number;
  tier: "Off-peak" | "Peak";
  effectiveFrom?: string;
  effectiveTo?: string;
  discountType: "PERCENT" | "FIXED" | null;
  discountDirection: "DISCOUNT" | "SURCHARGE" | null;
  discountValue: number | null;
}

/**
 * Date-range price adjustment (vacation-season increase, exam/Ramadan reduction).
 * Applied on top of the regular slot price for matching cells only; when the
 * range ends the regular price applies again automatically. At most one
 * adjustment can match a cell, and it never stacks with a dated slot price.
 */
export interface PriceAdjustment {
  id: string;
  label: string;
  pitchIds: string[];
  effectiveFrom: string; // YYYY-MM-DD, inclusive (Dhaka)
  effectiveTo: string;   // YYYY-MM-DD, inclusive (Dhaka)
  days: number[];        // weekdays 0–6 it applies to
  startTime: string;     // slots STARTING in [startTime, endTime)
  endTime: string;
  direction: "DISCOUNT" | "SURCHARGE";
  type: "PERCENT" | "FIXED" | "PRICE"; // PRICE = set the slot price to `value`
  value: number;
}

export type ClaimState = "HELD" | "BOOKED" | "MAINTENANCE";

export interface SlotClaim {
  pitchId: string;
  cellStart: string; // ISO UTC
  state: ClaimState;
  bookingId?: string;
  reason?: string;
  expiresAt?: string; // ISO UTC
}

export type SlotStatus = "AVAILABLE" | "HELD" | "BOOKED" | "MAINTENANCE" | "PAST";

export type BookingStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export type PaymentStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED";

export interface Policies {
  slotMinutes: number;
  // Venue-wide default advance. Each sport now sets its own (SportConfig); these are
  // used only by sports that have no percentage of their own yet, and to prefill new sports.
  advancePercent: number;           // 06:00–24:00 (day), any whole 1–100
  nightAdvancePercent: number;      // 00:00–06:00 (night), any whole 1–100, default 100
  holdMinutes: number;
  checkInOpensMinutesBefore: number;
  bookingHorizonDays: number;
  vatRatePercent: number | null;
  vatMode: "inclusive" | "exclusive";
  vatRegistrationNo: string;
}

export type Venue = Branch;