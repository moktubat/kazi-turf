import { z } from "zod";
import { phoneInput } from "./common";
import { customerPasswordChangeSchema } from "./password";

const optionalEmail = z
    .string()
    .trim()
    .max(120, "Too long")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email");

export const profileSchema = z.object({
    name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
    phone: phoneInput,
    email: optionalEmail,
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const passwordSchema = customerPasswordChangeSchema();

export type PasswordInput = z.infer<typeof passwordSchema>;

export const changeRequestSchema = z.object({
    kind: z.enum(["CANCEL", "RESCHEDULE"]),
    reason: z.string().trim().min(5, "Add a short reason (5+ characters)").max(300, "Keep it under 300 characters"),
});
export type ChangeRequestInput = z.infer<typeof changeRequestSchema>;