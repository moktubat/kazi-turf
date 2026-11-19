import type { AuditAction, AuditMeta } from "@/types/ops";

export interface InsightsKpis {
    bookings: number;
    /** Gross booking value in the selected range (before refunds of cancelled ones are excluded). */
    totalAmount: number;
    collected: number;
    /** Part of "collected" that was received as an advance payment. */
    advanceAmount: number;
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