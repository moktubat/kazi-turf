// Shared by the Setup forms (client pre-check) and the Setup API routes (server re-validates).
import { z } from "zod";
import { policies } from "@/data/site";
import { normalizePhone } from "@/lib/phone";
import { toMinutes } from "@/lib/time";
import { phoneInput } from "./common";

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

/* ---------- Branches ---------- */
const branchBase = z.object({
    name: z.string().trim().min(2, "Enter a name").max(60, "Too long"),
    slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(2, "Too short")
        .max(40, "Too long")
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only"),
    address: z.string().trim().min(3, "Enter an address").max(200, "Too long"),
    phone: tel,
    whatsapp: tel,
    mapUrl: z
        .string()
        .trim()
        .max(300, "Too long")
        .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Must start with https://"),
    hours: z.string().trim().max(60, "Too long"),
    status: z.enum(["ACTIVE", "COMING_SOON", "DISABLED"]),
    sports: list(10),
});

const branchActiveRules = (v: z.infer<typeof branchBase>, ctx: z.RefinementCtx) => {
    if (v.status !== "ACTIVE") return;
    const need = (path: "phone" | "whatsapp" | "mapUrl" | "hours") => {
        if (!v[path]) ctx.addIssue({ code: "custom", path: [path], message: "Required for an active branch" });
    };
    need("phone");
    need("whatsapp");
    need("mapUrl");
    need("hours");
    if (v.sports.length === 0) ctx.addIssue({ code: "custom", path: ["sports"], message: "Add at least one sport" });
};

export const branchSchema = branchBase.superRefine(branchActiveRules);
export const branchUpdateSchema = branchBase.extend({ id: z.string().min(1).max(60) }).superRefine(branchActiveRules);
export type BranchInput = z.infer<typeof branchSchema>;
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

/* ---------- Pitches ---------- */
const pitchBase = z.object({
    branchId: z.string().min(1).max(60),
    name: z.string().trim().min(2, "Enter a name").max(40, "Too long"),
    sport: z.string().trim().min(2, "Choose a sport").max(30, "Too long"),
    format: z.string().trim().min(1, "Enter a format").max(40, "Too long"),
    dimensions: z.string().trim().max(60, "Too long"),
    surface: z.string().trim().max(60, "Too long"),
    openTime: hhmm,
    closeTime: hhmm,
    maxConsecutiveSlots: z.number().int().min(1, "At least 1").max(4, "At most 4"),
    facilities: list(12),
    image: z
        .string()
        .trim()
        .max(200, "Too long")
        .refine((v) => v === "" || /^\/[\w\-./]+$/.test(v), "Use a path like /gallery/pitch-a.jpg"),
    status: z.enum(["ACTIVE", "DISABLED"]),
});

const pitchGridRule = (v: z.infer<typeof pitchBase>, ctx: z.RefinementCtx) => {
    const step = policies.slotMinutes;
    const open = toMinutes(v.openTime);
    const close = toMinutes(v.closeTime);
    if (v.openTime === "24:00") ctx.addIssue({ code: "custom", path: ["openTime"], message: "Open before midnight" });
    else if (close <= open) ctx.addIssue({ code: "custom", path: ["closeTime"], message: "Must be after opening" });
    else if ((close - open) % step !== 0) {
        ctx.addIssue({
            code: "custom",
            path: ["closeTime"],
            message: `Opening to closing must be a whole number of ${step}-minute slots`,
        });
    }
};

export const pitchSchema = pitchBase.superRefine(pitchGridRule);
export const pitchUpdateSchema = pitchBase.extend({ id: z.string().min(1).max(80) }).superRefine(pitchGridRule);
export type PitchInput = z.infer<typeof pitchSchema>;
export type PitchUpdateInput = z.infer<typeof pitchUpdateSchema>;

/* ---------- Rates ---------- */
const rateBase = z.object({
    pitchId: z.string().min(1).max(80),
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
    startTime: hhmm,
    endTime: hhmm,
    pricePerSlot: z.number().int("Whole taka only").min(100, "Too low").max(100000, "Too high"),
    tier: z.enum(["Off-peak", "Peak"]),
    effectiveFrom: optDate,
    effectiveTo: optDate,
});

const rateRules = (v: z.infer<typeof rateBase>, ctx: z.RefinementCtx) => {
    if (toMinutes(v.startTime) >= toMinutes(v.endTime)) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "Must be after the start" });
    }
    if (v.effectiveFrom && v.effectiveTo && v.effectiveTo < v.effectiveFrom) {
        ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "Must be on or after the start date" });
    }
};

export const rateSchema = rateBase.superRefine(rateRules);
export const rateUpdateSchema = rateBase.extend({ id: z.string().min(1).max(80) }).superRefine(rateRules);
export const rateDeleteSchema = z.object({ id: z.string().min(1).max(80) });
export type RateInput = z.infer<typeof rateSchema>;
export type RateUpdateInput = z.infer<typeof rateUpdateSchema>;

/* ---------- Staff ---------- */
const staffShape = {
    role: z.enum(["STAFF", "SUPER_ADMIN"]),
    branchIds: z.array(z.string().min(1).max(60)).max(20),
    permissions: z.array(z.enum(["pitches.edit"])).max(5),
};
const staffBranchRule = {
    path: ["branchIds"],
    message: "Assign at least one branch",
};

export const staffCreateSchema = z
    .object({
        name: z.string().trim().min(2, "Enter a name").max(80, "Too long"),
        phone: phoneInput.transform(normalizePhone),
        email: optionalEmail,
        password: z.string().min(8, "Use at least 8 characters").max(72, "Too long"),
        ...staffShape,
    })
    .refine((v) => v.role !== "STAFF" || v.branchIds.length > 0, staffBranchRule);

export const staffUpdateSchema = z
    .object({
        id: z.string().min(1).max(80),
        status: z.enum(["ACTIVE", "DISABLED"]),
        newPassword: z
            .string()
            .max(72, "Too long")
            .refine((v) => v === "" || v.length >= 8, "Use at least 8 characters")
            .optional(),
        ...staffShape,
    })
    .refine((v) => v.role !== "STAFF" || v.branchIds.length > 0, staffBranchRule);

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

/* ---------- Policies ---------- */
const text = (max: number) => z.string().trim().max(max, "Too long");

export const policySchema = z.object({
    holdMinutes: z.number().int().min(5, "At least 5 minutes").max(30, "At most 30 minutes"),
    advancePercent: z.number().int().min(30, "Allowed range is 30–50").max(50, "Allowed range is 30–50"),
    checkInOpensMinutesBefore: z.number().int().min(0, "0 or more").max(120, "At most 120"),
    bookingHorizonDays: z.number().int().min(1, "At least 1 day").max(60, "At most 60 days"),
    vatRatePercent: z.number().min(0.01, "Must be above 0").max(30, "Too high").nullable(),
    vatMode: z.enum(["inclusive", "exclusive"]),
    vatRegistrationNo: text(40),
    refund: z.object({
        tiers: z
            .array(
                z.object({
                    when: z.string().trim().min(3, "Describe the window").max(80, "Too long"),
                    outcome: z.string().trim().min(3, "Describe the outcome").max(160, "Too long"),
                })
            )
            .max(6, "At most 6 rules"),
        method: text(200),
        timing: text(200),
        rainCheckEligibility: text(300),
        rainCheckExpiryDays: z.number().int().min(1, "At least 1 day").max(365, "At most 365 days").nullable(),
        exceptions: z.array(z.string().trim().min(3, "Too short").max(160, "Too long")).max(6, "At most 6"),
    }),
    legalReviewed: z.boolean(),
});
export type PolicyInput = z.infer<typeof policySchema>;

/* ---------- Inquiries ---------- */
export const inquiryHandleSchema = z.object({ id: z.string().min(1).max(60) });