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
  advancePercent: number;           // 06:00–24:00 (day), allowed 30–50
  nightAdvancePercent: number;      // 00:00–06:00 (night), allowed 50–100, default 100
  holdMinutes: number;
  checkInOpensMinutesBefore: number;
  bookingHorizonDays: number;
  vatRatePercent: number | null;
  vatMode: "inclusive" | "exclusive";
  vatRegistrationNo: string;
}

export type Venue = Branch;