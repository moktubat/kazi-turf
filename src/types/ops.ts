export type AuditAction =
    | "WALKIN_CREATED"
    | "BOOKING_CANCELLED"
    | "SLOT_BLOCKED"
    | "SLOT_UNBLOCKED"
    | "BALANCE_COLLECTED"
    | "CHECKED_IN"
    | "CHECKIN_OVERRIDE"
    | "CHECKIN_BLOCKED"
    | "REFUND_RECORDED"
    | "CHANGE_REQUEST_HANDLED"
    // reserved for Setup / payments / earlier TODO(audit) markers
    | "BOOKING_CREATED"
    | "PROFILE_CHANGED"
    | "PRICE_CHANGED"
    | "ROLE_CHANGED"
    | "POLICY_CHANGED";

export type AuditMeta = Record<string, string | number | boolean | null>;

export interface AuditLog {
    id: string;
    actorId: string;
    actorName: string;
    action: AuditAction;
    entityType: "BOOKING" | "SLOT" | "PITCH" | "BRANCH" | "USER" | "POLICY";
    entityId: string;
    branchId: string | null;
    meta: AuditMeta; // safe metadata only: never secrets, tokens or payment credentials
    at: string; // ISO UTC
}

export interface CheckIn {
    id: string;
    bookingId: string;
    checkedInAt: string;
    checkedInBy: string;
    result: "OK" | "OVERRIDE";
    balanceCollected: number;
}

export interface Payment {
    id: string;
    bookingId: string;
    provider: "BKASH" | "CASH";
    kind: "ADVANCE" | "BALANCE";
    providerTxnId?: string;
    amount: number;
    currency: "BDT";
    status: "PENDING" | "SUCCESS" | "FAILED";
    verifiedAt?: string;
    receivedBy?: string;
    createdAt: string;
}