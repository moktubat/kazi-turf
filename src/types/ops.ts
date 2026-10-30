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
    "PAYMENT_FAILED",
    "PAYMENT_ANOMALY",
    "PAYMENT_VERIFIED",
    "LATE_PAYMENT_REFUND",
    "PROFILE_CHANGED",
    "PASSWORD_CHANGED",
    "CHANGE_REQUESTED",
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

export type AuditMeta = Record<string, string | number | boolean | null>;

export interface AuditLog {
    id: string;
    actorId: string;
    actorName: string;
    action: AuditAction;
    entityType:
    | "BOOKING"
    | "SLOT"
    | "PITCH"
    | "BRANCH"
    | "USER"
    | "POLICY"
    | "INQUIRY";
    entityId: string;
    branchId: string | null;
    meta: AuditMeta;
    at: string;
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
    providerPaymentId?: string; // bKash paymentID (checkout session)
    providerTxnId?: string; // bKash trxID, set only after verification
    invoice?: string; // merchantInvoiceNumber we sent
    amount: number;
    currency: "BDT";
    status: "PENDING" | "SUCCESS" | "FAILED";
    failureReason?: "FAILED" | "CANCELLED" | "ABANDONED" | "CREATE_FAILED" | "MISMATCH";
    anomaly?: string; // needs a human: shown in Insights > Needs attention
    verifiedAt?: string;
    receivedBy?: string;
    createdAt: string;
}