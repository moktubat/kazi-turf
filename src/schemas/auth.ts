// Used by the inline auth form now and by the auth API routes in Batch 4.
import { z } from "zod";
import { phoneInput } from "./common";
import { customerPasswordSchema } from "./password";

export const loginSchema = z.object({
    identifier: z.string().trim().min(3, "Enter your email or phone").max(120, "Too long"),
    password: z.string().min(1, "Enter your password").max(72, "Too long"),
});

export const registerSchema = z.object({
    name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
    phone: phoneInput,
    email: z.string().trim().max(120, "Too long").refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email"),
    password: customerPasswordSchema,
    otpCode: z.string().regex(/^\d{6}$/, "Enter the 6-digit code sent to your phone"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;