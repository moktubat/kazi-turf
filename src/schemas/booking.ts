import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { phoneInput } from "./common";

const cellStarts = z.array(z.string().min(10).max(40)).min(1).max(4);

export const quoteSchema = z.object({
    pitchId: z.string().min(1).max(60),
    cellStarts,
});

// Price, branch, status and role are never accepted from the browser.
export const createBookingSchema = quoteSchema.extend({
    phone: phoneInput.transform(normalizePhone),
    acceptPolicy: z.boolean().refine((v) => v === true, "Accept the policy to continue"),
});

export const confirmFormSchema = z.object({
    phone: phoneInput,
    acceptPolicy: z.boolean().refine((v) => v === true, "Please accept the policy to continue"),
});
export type ConfirmFormInput = z.infer<typeof confirmFormSchema>;

export const availabilityQuerySchema = z.object({
    branch: z.string().min(1).max(60),
    sport: z.string().min(1).max(40),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});