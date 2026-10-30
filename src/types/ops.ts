export const AUDIT_ACTIONS = [
    "WALKIN_CREATED",
    "BOOKING_CANCELLED",
    "SLOT_BLOCKED",
    "SLOT_UNBLOCKED",
    "BALANCE_COLLECTED",
    "CHECKED_IN",
    "CHECKIN_OVERRIDE",
    "CHECKIN_BLOCKED",
    "REFUND_RECORDED",
    "CHANGE_REQUEST_HANDLED",
    "BOOKING_CREATED",
    "PROFILE_CHANGED",
    "PRICE_CHANGED",
    "ROLE_CHANGED",
    "POLICY_CHANGED",
    "BRANCH_CHANGED",
    "PITCH_CHANGED",
    "STAFF_CREATED",
    "PASSWORD_RESET",
    "INQUIRY_HANDLED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

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