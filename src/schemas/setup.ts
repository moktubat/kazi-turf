// Shared by the Setup forms (client pre-check) and the Setup API routes (server re-validates).
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { MAX_REGULAR_DISCOUNT_PERCENT, MIN_SLOT_PRICE, applyDiscount } from "@/lib/pricing";
import { toMinutes } from "@/lib/time";
import { phoneInput } from "./common";
import { staffPasswordSchema } from "./password";

const hhmm = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, "Use HH:MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const optDate = z.union([date, z.literal("")]);
const list = (max: number, itemMax = 30) =>
    z.array(z.string().trim().min(2, "Too short").max(itemMax, "Too long")).max(max, `At most ${max} items`);
const tel = z
    .string()
    .trim()
    .max(20, "Too long")
    .refine((v) => v === "" || /^\+?[\d\s-]{6,19}$/.test(v), "Enter a valid phone number");
const optionalEmail = z
    .string()
    .trim()
    .max(120, "Too long")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email");

// [CLOUDINARY] Shared image field. Accepts a local path under /public OR a
const imageField = z
    .string()
    .trim()
    .max(500, "Too long")
    .refine(
        (v) =>
            v === "" ||
            /^\/[\w\-./]+$/.test(v) || // local path under /public
            /^https:\/\/res\.cloudinary\.com\/[\w.-]+\/image\/upload\/[\w./-]+$/.test(v), // Cloudinary URL
        "Use a path like /gallery/pitch-a.jpg or a Cloudinary URL"
    );

// Sport-wise advance: any whole percentage 0–100. 0 = no advance (pay everything at the
// venue). Optional so older API callers that do not send it keep the sport's current value.
const advancePercentField = z
    .number({ error: "Enter a whole number from 0 to 100" })
    .int("Enter a whole number from 0 to 100")
    .min(0, "At least 0%")
    .max(100, "At most 100%");

/* ---------- Branch ---------- */
const branchBase = z.object({
    name: z.string().trim().min(2, "Enter a name").max(60, "Too long"),
    address: z.string().trim().min(3, "Enter an address").max(200, "Too long"),
    phone: tel,
    whatsapp: tel,
    mapUrl: z
        .string()
        .trim()
        .max(300, "Too long")
        .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Must start with https://"),
    hours: z.string().trim().max(60, "Too long"),
    status: z.enum(["ACTIVE", "DISABLED"]),
    sports: list(10),
    sportConfigs: z.array(
        z.object({
            id: z.string().trim().min(1, "Enter an ID").max(30, "Too long"),
            name: z.string().trim().min(2, "Enter a name").max(30, "Too long"),
            image: imageField,
            active: z.boolean(),
            advancePercent: advancePercentField.optional(),
            nightAdvancePercent: advancePercentField.optional(),
        })
    ).max(10, "At most 10 sports"),
});

const branchActiveRules = (v: z.infer<typeof branchBase>, ctx: z.RefinementCtx) => {
    if (v.status !== "ACTIVE") return;
    const need = (path: "phone" | "whatsapp" | "mapUrl" | "hours") => {
        if (!v[path]) ctx.addIssue({ code: "custom", path: [path], message: "Required when the venue is active" });
    };
    need("phone");
    need("whatsapp");
    need("mapUrl");
    need("hours");
    if (v.sports.length === 0) ctx.addIssue({ code: "custom", path: ["sports"], message: "Add at least one sport" });
};

export const branchUpdateSchema = branchBase
    .extend({
        id: z.string().min(1).max(60),
        // Sport ids this save actually changed (client-side diff against the
        // loaded snapshot). Untouched sports keep the server's current values,
        // so admins saving in parallel never overwrite each other's work.
        // Absent (old client / API call) = all sports touched = old behavior.
        touchedSportIds: z.array(z.string().max(30)).max(10).optional(),
    })
    .superRefine(branchActiveRules);
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

/* ---------- Pitches ---------- */
// Slot length is now a free integer input (15–240 min). The grid handles any
// value that divides 1440 evenly; non-dividing values simply produce a shorter
// final slot, which is acceptable for a 24-hour turf.
const pitchBase = z.object({
    branchId: z.string().min(1).max(60),
    name: z.string().trim().min(2, "Enter a name").max(40, "Too long"),
    sport: z.string().trim().min(2, "Choose a sport").max(30, "Too long"),
    format: z.string().trim().min(1, "Enter a format").max(40, "Too long"),
    dimensions: z.string().trim().max(60, "Too long"),
    surface: z.string().trim().max(60, "Too long"),
    // Turf is open 24 hours — these are constants, not user inputs.
    openTime: z.literal("00:00"),
    closeTime: z.literal("24:00"),
    slotMinutes: z
        .number()
        .int("Whole minutes only")
        .min(15, "Minimum 15 minutes")
        .max(240, "Maximum 4 hours (240 minutes)"),
    maxConsecutiveSlots: z.number().int().min(1, "At least 1").max(4, "At most 4"),
    facilities: list(12),
    image: imageField,
    status: z.enum(["ACTIVE", "DISABLED"]),
});

export const pitchSchema = pitchBase;
export const pitchUpdateSchema = pitchBase.extend({ id: z.string().min(1).max(80) });
export type PitchInput = z.infer<typeof pitchSchema>;
export type PitchUpdateInput = z.infer<typeof pitchUpdateSchema>;

/* ---------- Rates ---------- */
const rateBase = z.object({
    pitchId: z.string().min(1).max(80),
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
    startTime: hhmm,
    endTime: hhmm,
    pricePerSlot: z.number().int("Whole taka only").min(100, "Too low").max(100000, "Too high"),
    tier: z.enum(["Off-peak", "Peak"]).default("Off-peak"), // kept for data compat, UI hides it
    effectiveFrom: optDate,
    effectiveTo: optDate,
    discountType: z.enum(["PERCENT", "FIXED"]).nullable().default(null),
    // DISCOUNT lowers the price, SURCHARGE raises it (holidays, Eid week, events).
    // Combined with effectiveFrom/effectiveTo this is the dynamic date-range pricing.
    discountDirection: z.enum(["DISCOUNT", "SURCHARGE"]).nullable().default(null),
    discountValue: z.number().int().min(1, "Must be at least 1").max(100000, "Too high").nullable().default(null),
});


const rateRules = (v: z.infer<typeof rateBase>, ctx: z.RefinementCtx) => {
    if (toMinutes(v.startTime) >= toMinutes(v.endTime)) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "Must be after the start" });
    }
    if (v.effectiveFrom && v.effectiveTo && v.effectiveTo < v.effectiveFrom) {
        ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "Must be on or after the start date" });
    }
    if (v.discountType && !v.discountValue) {
        ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Enter an adjustment value" });
    }
    if (!v.discountType || !v.discountValue) return;
    const isDiscount = (v.discountDirection ?? "DISCOUNT") === "DISCOUNT";
    if (!isDiscount) {
        // Older "built-in increase" (kept for existing prices).
        if (v.discountType === "PERCENT" && v.discountValue > 100) {
            ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Percentage cannot exceed 100" });
        }
        return;
    }
    // Regular-price discount: a sensible percentage, and the customer always pays a real price.
    if (v.discountType === "PERCENT" && v.discountValue > MAX_REGULAR_DISCOUNT_PERCENT) {
        ctx.addIssue({ code: "custom", path: ["discountValue"], message: `A percentage discount can be 1–${MAX_REGULAR_DISCOUNT_PERCENT}%` });
        return;
    }
    const final = applyDiscount(v.pricePerSlot, v.discountType, v.discountValue, "DISCOUNT").discounted;
    if (final < MIN_SLOT_PRICE) {
        ctx.addIssue({
            code: "custom",
            path: ["discountValue"],
            message: `Customers would pay ৳${final}. The price after the discount must be at least ৳${MIN_SLOT_PRICE}.`,
        });
    }
};

export const rateSchema = rateBase.superRefine(rateRules);
export const rateUpdateSchema = rateBase.extend({ id: z.string().min(1).max(80) }).superRefine(rateRules);
export const rateDeleteSchema = z.object({ id: z.string().min(1).max(80) });
export type RateInput = z.infer<typeof rateSchema>;
export type RateUpdateInput = z.infer<typeof rateUpdateSchema>;

/* ---------- Seasonal pricing (date-range adjustments) ---------- */
const adjustmentBase = z.object({
    label: z.string().trim().min(2, "Give it a short name").max(60, "Too long"),
    pitchIds: z.array(z.string().min(1).max(80)).min(1, "Pick at least one field").max(50),
    effectiveFrom: date,
    effectiveTo: date,
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
    startTime: hhmm,
    endTime: hhmm,
    // SURCHARGE = price increase (vacation season), DISCOUNT = reduction (exams, Ramadan).
    direction: z.enum(["DISCOUNT", "SURCHARGE"]),
    // PRICE = new slot price for the period; FIXED = ৳ added/taken off; PERCENT = % added/taken off.
    type: z.enum(["PERCENT", "FIXED", "PRICE"]),
    value: z.number().int("Whole numbers only").min(1, "Must be at least 1").max(100000, "Too high"),
});

const adjustmentRules = (v: z.infer<typeof adjustmentBase>, ctx: z.RefinementCtx) => {
    if (v.effectiveTo < v.effectiveFrom) {
        ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "Must be on or after the start date" });
    }
    if (toMinutes(v.startTime) >= toMinutes(v.endTime)) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "Must be after the start" });
    }
    // A reduction can never make a slot free (it would become unbookable).
    if (v.type === "PERCENT" && v.direction === "DISCOUNT" && v.value > 90) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "A reduction can be at most 90%" });
    }
    if (v.type === "PERCENT" && v.direction === "SURCHARGE" && v.value > 200) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "An increase can be at most 200%" });
    }
    if (v.type === "PRICE" && v.value < 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the new slot price (at least ৳100)" });
    }
};

export const adjustmentSchema = adjustmentBase.superRefine(adjustmentRules);
export const adjustmentUpdateSchema = adjustmentBase.extend({ id: z.string().min(1).max(80) }).superRefine(adjustmentRules);
export const adjustmentDeleteSchema = z.object({ id: z.string().min(1).max(80) });
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
export type AdjustmentUpdateInput = z.infer<typeof adjustmentUpdateSchema>;

/* ---------- Staff ---------- */
const staffShape = {
    role: z.enum(["STAFF", "SUPER_ADMIN"]),
    branchIds: z.array(z.string().min(1).max(60)).max(20),
    permissions: z.array(z.enum(["pitches.edit"])).max(5),
};

const staffBranchRule = {
    path: ["branchIds"],
    message: "Assign the venue to the staff member",
};

export const staffCreateSchema = z
    .object({
        name: z.string().trim().min(2, "Enter a name").max(80, "Too long"),
        phone: phoneInput.transform(normalizePhone),
        email: optionalEmail,
        password: staffPasswordSchema,
        ...staffShape,
    })
    .refine((v) => v.role !== "STAFF" || v.branchIds.length > 0, staffBranchRule);

export const staffUpdateSchema = z
    .object({
        id: z.string().min(1).max(80),
        status: z.enum(["ACTIVE", "DISABLED"]),
        newPassword: z.string().max(72, "Too long").refine((v) => v === "" || staffPasswordSchema.safeParse(v).success, "Use at least 12 characters with mixed case, digits and symbols").optional(),
        ...staffShape,
    })
    .refine((v) => v.role !== "STAFF" || v.branchIds.length > 0, staffBranchRule);

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

/* ---------- Policies ---------- */
const text = (max: number) => z.string().trim().max(max, "Too long");

export const policySchema = z.object({
    holdMinutes: z.number().int().min(5, "At least 5 minutes").max(30, "At most 30 minutes"),
    // Any whole percentage the venue wants (e.g. 40, 45, 60, 75). At least 1%, so an
    // online booking always takes some bKash money; 100 = full payment as advance.
    // These are now the venue-wide DEFAULTS: each sport sets its own advance in Setup →
    // Venue. Optional — the Policies form no longer sends them, and a save without them
    // keeps the current values (used by sports saved before sport-wise advances existed).
    advancePercent: z.number({ error: "Enter a whole number from 1 to 100" }).int("Enter a whole number from 1 to 100").min(1, "At least 1%").max(100, "At most 100%").optional(),
    nightAdvancePercent: z.number({ error: "Enter a whole number from 1 to 100" }).int("Enter a whole number from 1 to 100").min(1, "At least 1%").max(100, "At most 100%").optional(),
    checkInOpensMinutesBefore: z.number().int().min(0, "0 or more").max(120, "At most 120"),
    bookingHorizonDays: z.number().int().min(1, "At least 1 day").max(60, "At most 60 days"),
    vatRatePercent: z.number().min(0.01, "Must be above 0").max(30, "Too high").nullable(),
    vatMode: z.enum(["inclusive", "exclusive"]),
    vatRegistrationNo: text(40),
    refund: z.object({
        tiers: z.array(
            z.object({
                when: z.string().trim().min(3, "Describe the window").max(80, "Too long"),
                outcome: z.string().trim().min(3, "Describe the outcome").max(160, "Too long"),
            })
        ).max(6, "At most 6 rules"),
        method: text(200),
        timing: text(200),
        exceptions: z.array(z.string().trim().min(3, "Too short").max(160, "Too long")).max(6, "At most 6"),
    }),
    legalReviewed: z.boolean(),
});
export type PolicyInput = z.infer<typeof policySchema>;

/* ---------- Inquiries ---------- */
export const inquiryHandleSchema = z.object({ id: z.string().min(1).max(60) });