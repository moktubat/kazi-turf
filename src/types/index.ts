export type Role = "CUSTOMER" | "STAFF" | "SUPER_ADMIN";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export type BranchStatus = "ACTIVE" | "COMING_SOON" | "DISABLED";

export interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  whatsapp: string;
  mapUrl: string;
  hours: string;
  status: BranchStatus;
  sports: string[];
}

export interface Pitch {
  id: string;
  branchId: string;
  name: string;
  sport: string;
  format: string;
  dimensions: string;
  surface: string;
  openTime: string; // "06:00"
  closeTime: string; // "24:00"
  maxConsecutiveSlots: number;
  facilities: string[];
  image: string | null;
  status: "ACTIVE" | "DISABLED";
}

export type RateTier = "Off-peak" | "Peak";

export interface PricingRule {
  id: string;
  pitchId: string;
  days: number[]; // 0 = Sunday ... 6 = Saturday (Asia/Dhaka)
  startTime: string;
  endTime: string;
  pricePerSlot: number;
  tier: RateTier;
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
  advancePercent: number; // allowed 30-50
  holdMinutes: number;
  checkInOpensMinutesBefore: number;
  bookingHorizonDays: number; // [CONFIRM]
  vatRatePercent: number | null; // null = no VAT anywhere
  vatMode: "inclusive" | "exclusive";
  vatRegistrationNo: string; // empty = hidden
}