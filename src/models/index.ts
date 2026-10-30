// Mongoose models (spec §11). Ids are string UUIDs in an `id` field so existing types and DTOs stay the same.
// Timestamps are ISO strings (UTC). No server-only import: the seed script and tests load this too.
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
        vatAmount: Number,
        total: Number,
        advanceAmount: Number,
        balanceAmount: Number,
        advancePercentSnapshot: Number,
        vatRatePercentSnapshot: { type: Number, default: null },
        source: { type: String, enum: ["online", "counter"], required: true },
        holdExpiresAt: String,
        createdAt: String,
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
    { id, name: String, contact: String, message: String, status: { type: String, default: "NEW" }, createdAt: String },
    opts
);
inquiry.index({ status: 1, createdAt: -1 });

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
    { key: { type: String, required: true, unique: true }, value: Schema.Types.Mixed, updatedAt: String },
    opts
);

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

export const allModels = () => Object.values(mongoose.models);