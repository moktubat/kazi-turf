import type { AuditAction, AuditMeta } from "@/types/ops";

export interface InsightsKpis {
    bookings: number;
    collected: number;
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
}

export interface InquiryDto {
    id: string;
    name: string;
    contact: string;
    message: string;
    status: "NEW" | "HANDLED";
    createdAt: string;
}

export interface AuditRow {
    id: string;
    action: AuditAction;
    actorName: string;
    at: string;
    entityType: string;
    entityId: string;
    branchName: string;
    meta: AuditMeta;
}