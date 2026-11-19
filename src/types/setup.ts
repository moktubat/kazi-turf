import type { Branch, Pitch, PriceAdjustment } from "@/types";
import type { SportAdvance } from "@/lib/advance";

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
    /** Venue-wide default advance (sports set their own in Venue). */
    advancePercent: number;
    nightAdvancePercent: number;
    checkInOpensMinutesBefore: number;
    bookingHorizonDays: number;
    vatRatePercent: number | null;
    vatMode: "inclusive" | "exclusive";
    vatRegistrationNo: string;
    refund: {
        tiers: { when: string; outcome: string }[];
        method: string;
        timing: string;
        exceptions: string[];
    };
    legalReviewed: boolean;
}

export interface SetupData {
    tabs: SetupTab[];
    venue: Branch | null;
    /** Advance a newly added sport starts with (the venue-wide default from Policies). */
    defaultAdvance: SportAdvance;
    pitches: SetupPitch[];
    rates: SetupRate[];
    /** Seasonal (date-range) price adjustments touching this venue's fields. */
    adjustments: PriceAdjustment[];
    /** Today's date in Dhaka (YYYY-MM-DD), for Active / Upcoming / Ended labels. */
    today: string;
    coverage: Record<string, string[]>;
    staff: SetupStaff[];
    slotMinutes: number;
    policies: PolicyForm | null;
}