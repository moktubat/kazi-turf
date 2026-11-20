import type { AuditAction, AuditMeta } from "@/types/ops";

export interface InsightsKpis {
    bookings: number;
    /** Gross booking value in the selected range. */
    totalAmount: number;
    collected: number;
    /** Part of "collected" that was received as an advance payment (by payment date). */
    advanceAmount: number;
    /** Advances (paid on any day) on the bookings whose play date is in the range — same basis as the Staff Desk. */
    advanceOnBookings: number;
    pendingAmount: number;
    pendingCount: number;
    balanceDue: number;
    occupancyPct: number | null;
    bookedCells: number;
    totalCells: number;
}

export interface RevenueRow {
    key: string;
    label: string;
    total: number;
    byBranch: Record<string, number>;
}

export interface InsightsData {
    from: string;
    to: string;
    branch: string | null;
    sport: string | null;   // null = "all sports"
    kpis: InsightsKpis;
    revenue: {
        bucket: "day" | "week";
        branches: { id: string; name: string }[];
        rows: RevenueRow[];
        total: number;
    };
    heatmap: { times: string[]; days: string[]; cells: (number | null)[][] };
    source: {
        online: { bookings: number; collected: number };
        counter: { bookings: number; collected: number };
    };
}

export interface AttentionItem {
    code: string;
    title: string;
    detail: string;
}

export interface AttentionGroup {
    id: "payments" | "expired" | "refunds" | "balances";
    title: string;
    hint: string;
    count: number;
    items: AttentionItem[];
    /** Bookings list filtered to (at least) every item of this group, when one filter can express it. */
    viewAll?: string;
}

export interface InquiryDto {
    id: string;
    /** Legacy composed fields ("First Last", phone, "[Sport] Subject\n\nBody") — always present. */
    name: string;
    contact: string;
    message: string;
    /** Structured contact-form fields (newer records; null on legacy rows). */
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    sport?: string | null;
    subject?: string | null;
    body?: string | null;
    status: "NEW" | "HANDLED";
    createdAt: string;
}

export interface AuditRow {
    id: string;
    action: AuditAction;
    actorName: string;
    at: string;
    branchName: string;
    entityType: string;
    entityId: string;
    meta: AuditMeta;
}