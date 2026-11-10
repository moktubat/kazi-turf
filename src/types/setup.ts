import type { Branch, DiscountType, Pitch, PricingRule } from "@/types";

export type SetupTab = "venue" | "pitches" | "rates" | "staff" | "policies";

export interface SetupPitch extends Pitch {
    upcomingBookings: number;
}

export interface SetupRate {
    id: string;
    pitchId: string;
    days: number[];
    startTime: string;
    endTime: string;
    pricePerSlot: number;
    tier: "Off-peak" | "Peak";
    effectiveFrom: string;
    effectiveTo: string;
    aligned: boolean;
    discountType: "PERCENT" | "FIXED" | null;
    discountDirection: "DISCOUNT" | "SURCHARGE" | null;
    discountValue: number | null;
}

export interface SetupStaff {
    id: string;
    name: string;
    phone: string;
    email: string;
    role: "STAFF" | "SUPER_ADMIN";
    branchIds: string[];
    permissions: string[];
    status: "ACTIVE" | "DISABLED";
    isSelf: boolean;
}

export interface PolicyForm {
    holdMinutes: number;
    advancePercent: number;
    checkInOpensMinutesBefore: number;
    bookingHorizonDays: number;
    vatRatePercent: number | null;
    vatMode: "inclusive" | "exclusive";
    vatRegistrationNo: string;
    refund: {
        tiers: { when: string; outcome: string }[];
        method: string;
        timing: string;
        rainCheckEligibility: string;
        rainCheckExpiryDays: number | null;
        exceptions: string[];
    };
    legalReviewed: boolean;
}

export interface SetupData {
    tabs: SetupTab[];
    venue: Branch | null;
    pitches: SetupPitch[];
    rates: SetupRate[];
    coverage: Record<string, string[]>;
    staff: SetupStaff[];
    slotMinutes: number;
    policies: PolicyForm | null;
}