import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { WALKIN_NOTE_MAX } from "@/lib/walkInNote";
import { CHECKIN_REASON_MAX, CHECKIN_REASON_MIN, CHECKIN_REASON_TOO_SHORT } from "@/lib/checkInReason";
import { phoneInput } from "./common";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoStart = z.string().min(10).max(40);
const pitchId = z.string().min(1).max(60);

export const BOOKING_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "EXPIRED"] as const;
export const PAYMENT_STATUSES = [
    "NOT_STARTED", "PENDING", "PARTIALLY_PAID", "PAID", "FAILED", "CANCELLED", "REFUND_PENDING", "REFUNDED",
] as const;

export const boardQuerySchema = z.object({
    branch: z.string().min(1).max(60).optional(),  // optional; defaults to the single venue
    date: day,
});

export const walkInQuoteSchema = z.object({
    pitchId,
    cellStarts: z.array(isoStart).min(1).max(4),
});

export const walkInSchema = walkInQuoteSchema.extend({
    phone: phoneInput.transform(normalizePhone),
    name: z.string().trim().max(80).optional(),
    // Staff may take no advance at all (0): the whole total is then due at the venue.
    cashReceived: z.number().int().min(0).max(1_000_000),
    // Optional counter discount: whole taka (FIXED) or whole percent (PERCENT) off the
    // subtotal. The server re-checks it against the real price (lib/counterDiscount).
    discount: z
        .object({
            type: z.enum(["FIXED", "PERCENT"]),
            value: z.number({ error: "Enter a whole number" }).int("Enter a whole number").min(0, "0 or more").max(1_000_000),
        })
        .refine((d) => d.type !== "PERCENT" || d.value <= 100, { path: ["value"], message: "At most 100%" })
        .optional(),
    // Staff note, e.g. "Paid" / "Unpaid". Blank is stored as no note.
    note: z.string().trim().max(WALKIN_NOTE_MAX, `Keep the note under ${WALKIN_NOTE_MAX} characters`).optional(),
});

export const customerLookupSchema = z.object({ phone: phoneInput.transform(normalizePhone) });

export const checkInSchema = z.object({
    identity: z.discriminatedUnion("method", [
        z.object({ method: z.literal("PHONE"), digits: z.string().regex(/^\d{4}$/, "Enter the last 4 digits") }),
        z.object({ method: z.literal("NAME") }),
    ]),
    collectBalance: z.boolean(),
    // Optional. Blank (or only spaces) counts as no reason; a typed reason needs 5+ characters.
    overrideReason: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z.string().trim().min(CHECKIN_REASON_MIN, CHECKIN_REASON_TOO_SHORT).max(CHECKIN_REASON_MAX).optional()
    ),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const cancelSchema = z.object({
    reason: z.string().trim().min(5, "Add a short reason (5+ characters)").max(200, "Keep it under 200 characters"),
});

export const refundSchema = z.object({ note: z.string().trim().max(200).optional() });

// Block one cell for MAINTENANCE (repair) or HELD (manual hold — walk-ins who
// pay at the venue, friends & family). Unblock deletes either kind.
export const blockSchema = z
    .object({
        pitchId,
        cellStart: isoStart,
        block: z.boolean(),
        kind: z.enum(["MAINTENANCE", "HELD"]).default("MAINTENANCE"),
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
    // Next-page cursor from the previous response: "<startAt ISO>|<booking code>".
    before: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|KT-[A-HJ-NP-Z2-9]{6}$/).optional(),
});