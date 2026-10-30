import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { phoneInput } from "./common";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoStart = z.string().min(10).max(40);
const pitchId = z.string().min(1).max(60);

export const BOOKING_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "EXPIRED"] as const;
export const PAYMENT_STATUSES = [
    "NOT_STARTED", "PENDING", "PARTIALLY_PAID", "PAID", "FAILED", "CANCELLED", "REFUND_PENDING", "REFUNDED",
] as const;

export const boardQuerySchema = z.object({ branch: z.string().min(1).max(60), date: day });

export const walkInQuoteSchema = z.object({
    pitchId,
    cellStarts: z.array(isoStart).min(1).max(4),
});

export const walkInSchema = walkInQuoteSchema.extend({
    phone: phoneInput.transform(normalizePhone),
    name: z.string().trim().max(80).optional(),
    cashReceived: z.number().int().min(1).max(1_000_000),
});

export const customerLookupSchema = z.object({ phone: phoneInput.transform(normalizePhone) });

export const checkInSchema = z.object({
    identity: z.discriminatedUnion("method", [
        z.object({ method: z.literal("PHONE"), digits: z.string().regex(/^\d{4}$/, "Enter the last 4 digits") }),
        z.object({ method: z.literal("NAME") }),
    ]),
    collectBalance: z.boolean(),
    overrideReason: z.string().trim().min(5, "Add a reason (5+ characters)").max(200).optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const cancelSchema = z.object({
    reason: z.string().trim().min(5, "Add a short reason (5+ characters)").max(200, "Keep it under 200 characters"),
});

export const refundSchema = z.object({ note: z.string().trim().max(200).optional() });

export const blockSchema = z
    .object({
        pitchId,
        cellStart: isoStart,
        block: z.boolean(),
        reason: z.string().trim().max(120).optional(),
    })
    .refine((v) => !v.block || (!!v.reason && v.reason.length >= 3), {
        path: ["reason"],
        message: "Add a reason (3+ characters)",
    });

export const bookingSearchSchema = z.object({
    from: day.optional(),
    to: day.optional(),
    branch: z.string().max(60).optional(),
    bookingStatus: z.enum(BOOKING_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    source: z.enum(["online", "counter"]).optional(),
    q: z.string().trim().min(3, "Type at least 3 characters").max(60).optional(),
    request: z.literal("open").optional(),
    limit: z.string().regex(/^\d{1,3}$/).optional(),
});