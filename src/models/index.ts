// Mongoose models (spec §11). Ids are string UUIDs in an `id` field so existing types and DTOs stay the same.
// Timestamps are ISO strings (UTC). No server-only import: scripts and tests load this too.
/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Schema, type Model } from "mongoose";

const opts = { versionKey: false, minimize: false } as const;
const reg = (name: string, schema: Schema): Model<any> =>
    (mongoose.models[name] as Model<any>) ?? mongoose.model(name, schema);

const id = { type: String, required: true, unique: true };

/* ---------- users and sessions ---------- */
const user = new Schema(
    {
        id,
        name: { type: String, required: true },
        email: { type: String, default: null },
        phone: { type: String, required: true, unique: true },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: ["CUSTOMER", "STAFF", "SUPER_ADMIN"], required: true },
        branchIds: [String],
        permissions: [String],
        status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
        createdAt: String,
        phoneVerified: { type: Boolean, default: false },
        // True only after the CURRENT email was confirmed with a code. Older accounts have no
        // value (= not verified) and keep logging in exactly as before.
        emailVerified: { type: Boolean, default: false },
    },
    opts
);
user.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });

const session = new Schema(
    {
        keyHash: { type: String, required: true, unique: true },
        userId: { type: String, required: true, index: true },
        expiresAt: { type: Date, required: true },
        createdAt: Date,
    },
    opts
);
session.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // housekeeping only: reads also check expiry

/* ---------- booking domain ---------- */
const booking = new Schema(
    {
        id,
        bookingCode: { type: String, required: true, unique: true },
        customerId: { type: String, required: true },
        customerName: String,
        phone: String,
        branchId: { type: String, required: true },
        pitchId: { type: String, required: true },
        date: { type: String, required: true },
        startAt: { type: String, required: true },
        endAt: { type: String, required: true },
        cellStarts: [String],
        slotCount: Number,
        bookingStatus: { type: String, required: true },
        paymentStatus: { type: String, required: true },
        subtotal: Number,
        // Price before any date-range discount/surcharge — lets the summary show
        // "৳3,500 → ৳2,700". Old bookings may not have it; toDto falls back to subtotal.
        originalSubtotal: Number,
        vatAmount: Number,
        total: Number,
        advanceAmount: Number,
        balanceAmount: Number,
        advancePercentSnapshot: Number,
        vatRatePercentSnapshot: { type: Number, default: null },
        source: { type: String, enum: ["online", "counter"], required: true },
        holdExpiresAt: String,
        createdAt: String,
        createdFromIp: { type: String, default: null }, // for IP-based abuse caps
        checkedInAt: String,
        cancelledAt: String,
        cancelReason: String,
    },
    opts
);
booking.index({ branchId: 1, date: 1 });
booking.index({ pitchId: 1, startAt: 1 });
booking.index({ customerId: 1, startAt: -1 });
booking.index({ bookingStatus: 1, paymentStatus: 1 });
booking.index({ bookingStatus: 1, holdExpiresAt: 1 });
booking.index({ createdFromIp: 1, createdAt: -1 });
// Admin Bookings list / CSV: newest first with a limit, bookingCode as the page tie-breaker.
// Without it every load read and sorted ALL bookings in memory (4,680 read to return 100 in
// the audit benchmark).
booking.index({ startAt: -1, bookingCode: -1 });

const slotClaim = new Schema(
    {
        pitchId: { type: String, required: true },
        cellStart: { type: String, required: true },
        state: { type: String, enum: ["HELD", "BOOKED", "MAINTENANCE"], required: true },
        bookingId: String,
        reason: String,
        expiresAt: String,
    },
    opts
);
// Two claims can never exist for the same pitch and cell. This is the double-booking guard.
slotClaim.index({ pitchId: 1, cellStart: 1 }, { unique: true });
slotClaim.index({ bookingId: 1 });
slotClaim.index({ expiresAt: 1 });

const payment = new Schema(
    {
        id,
        bookingId: { type: String, required: true, index: true },
        provider: { type: String, enum: ["BKASH", "CASH"], required: true },
        kind: { type: String, enum: ["ADVANCE", "BALANCE"], required: true },
        providerPaymentId: { type: String, index: true },
        providerTxnId: String,
        invoice: String,
        amount: { type: Number, required: true },
        currency: { type: String, default: "BDT" },
        status: { type: String, enum: ["PENDING", "SUCCESS", "FAILED"], required: true },
        failureReason: String,
        anomaly: String,
        verifiedAt: String,
        receivedBy: String,
        createdAt: String,
    },
    opts
);
payment.index({ providerTxnId: 1 }, { unique: true, partialFilterExpression: { providerTxnId: { $type: "string" } } });
payment.index({ provider: 1, status: 1, createdAt: 1 });
// Insights (collected by verifiedAt, pending) and the Staff Desk's cash-today total filter by
// status + verifiedAt without a provider prefix: without this they scanned every payment.
payment.index({ status: 1, verifiedAt: 1 });

const checkIn = new Schema(
    {
        id,
        bookingId: { type: String, required: true, index: true },
        checkedInAt: String,
        checkedInBy: String,
        result: { type: String, enum: ["OK", "OVERRIDE"] },
        balanceCollected: Number,
    },
    opts
);

const auditLog = new Schema(
    {
        id,
        actorId: String,
        actorName: String,
        action: { type: String, required: true },
        entityType: String,
        entityId: String,
        branchId: { type: String, default: null },
        meta: { type: Schema.Types.Mixed, default: {} },
        at: { type: String, required: true },
    },
    opts
);
auditLog.index({ at: -1 });
auditLog.index({ entityType: 1, entityId: 1, at: -1 });
auditLog.index({ branchId: 1, at: -1 });

const inquiry = new Schema(
    {
        id,
        name: String,
        contact: String,
        message: String,
        firstName: { type: String, default: null },
        lastName: { type: String, default: null },
        email: { type: String, default: null },
        phone: { type: String, default: null },
        sport: { type: String, default: null },
        subject: { type: String, default: null },
        body: { type: String, default: null },
        status: { type: String, default: "NEW" },
        createdAt: String,
        expiresAt: { type: Date, required: true }, // 365 days after createdAt
    },
    opts
);
inquiry.index({ status: 1, createdAt: -1 });
// TTL: MongoDB auto-deletes documents where expiresAt <= now.
inquiry.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });


const changeRequest = new Schema(
    {
        id,
        bookingCode: { type: String, required: true, index: true },
        customerId: String,
        kind: { type: String, enum: ["CANCEL", "RESCHEDULE"] },
        reason: String,
        status: { type: String, enum: ["OPEN", "HANDLED"], default: "OPEN" },
        createdAt: String,
    },
    opts
);

// Editable Setup values (branches, pitches, rates, policies). Wired up in Batch 9.
const config = new Schema(
    {
        key: { type: String, required: true, unique: true },
        value: Schema.Types.Mixed,
        updatedAt: String,
        version: { type: Number, default: 0 },
    },
    opts
);

// Email verification codes (registration and email change). The code itself is never
// stored: only an HMAC bound to the record id. Records are kept for a day after creation
// (purgeAt) so the per-email and per-IP send limits survive across server instances;
// whether a code still works is decided by expiresAt / consumedAt / supersededAt.
const emailOtp = new Schema(
    {
        id,
        email: { type: String, required: true },
        purpose: { type: String, enum: ["REGISTER", "EMAIL_CHANGE"], required: true },
        userId: { type: String, default: null }, // EMAIL_CHANGE: the account asking
        codeHash: { type: String, required: true },
        attempts: { type: Number, default: 0 },
        expiresAt: { type: Date, required: true },
        consumedAt: { type: Date, default: null },
        supersededAt: { type: Date, default: null },
        ipHash: { type: String, default: null },
        createdAt: { type: Date, required: true },
        purgeAt: { type: Date, required: true },
    },
    opts
);
emailOtp.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
emailOtp.index({ email: 1, purpose: 1, createdAt: -1 });
emailOtp.index({ ipHash: 1, createdAt: -1 });

const resetToken = new Schema(
    {
        id,
        userId: { type: String, required: true, index: true },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
        usedAt: { type: Date, default: null },
        createdAt: Date,
    },
    opts
);
resetToken.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserModel = reg("User", user);
export const SessionModel = reg("Session", session);
export const BookingModel = reg("Booking", booking);
export const SlotClaimModel = reg("SlotClaim", slotClaim);
export const PaymentModel = reg("Payment", payment);
export const CheckInModel = reg("CheckIn", checkIn);
export const AuditLogModel = reg("AuditLog", auditLog);
export const InquiryModel = reg("Inquiry", inquiry);
export const ChangeRequestModel = reg("ChangeRequest", changeRequest);
export const ConfigModel = reg("Config", config);
export const BranchModel = reg(
    "Branch",
    new Schema(
        {
            id,
            name: { type: String, required: true },
            status: { type: String, default: "ACTIVE" },
        },
        opts
    )
);

export const PitchModel = reg(
    "Pitch",
    new Schema(
        {
            id,
            branchId: String,
            name: String,
            sport: String,
            status: { type: String, default: "ACTIVE" },
        },
        opts
    )
);

export const allModels = () => Object.values(mongoose.models);
export const EmailOtpModel = reg("EmailOtp", emailOtp);
export const ResetTokenModel = reg("ResetToken", resetToken);