// Used by the inline auth form and the auth API routes.
import { z } from "zod";
import { phoneInput } from "./common";
import { customerPasswordSchema } from "./password";

export const loginSchema = z.object({
    identifier: z.string().trim().min(3, "Enter your email or phone").max(120, "Too long"),
    password: z.string().min(1, "Enter your password").max(72, "Too long"),
});

/** A required email, the same rule everywhere a code is sent to it. */
export const requiredEmail = z
    .string()
    .trim()
    .min(1, "Enter your email")
    .max(120, "Too long")
    .refine((v) => z.string().email().safeParse(v).success, "Enter a valid email");

export const otpCodeInput = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your email");

/** Step 1 of sign-up: the details. A code is emailed once these pass. */
export const registerDetailsSchema = z.object({
    name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
    phone: phoneInput,
    email: requiredEmail,
    password: customerPasswordSchema,
});

/** Step 2: the same details plus the emailed code. */
export const registerSchema = registerDetailsSchema.extend({ otpCode: otpCodeInput });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterDetailsInput = z.infer<typeof registerDetailsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
