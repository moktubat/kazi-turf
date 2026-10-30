import type { Branch, Pitch, PricingRule } from "@/types";

export type SetupTab = "branches" | "pitches" | "rates" | "staff" | "policies";

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
    tier: PricingRule["tier"];
    effectiveFrom: string;
    effectiveTo: string;
    aligned: boolean; // window sits on the pitch's current slot grid
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
    isAdmin: boolean;
    slotMinutes: number;
    branches: Branch[];
    pitches: SetupPitch[];
    rates: SetupRate[];
    coverage: Record<string, string[]>; // pitchId -> "Fri: no price at 06:00, 07:30"
    staff: SetupStaff[];
    policies: PolicyForm | null;
}