// Used by the inline auth form now and by the auth API routes in Batch 4.
import { z } from "zod";
import { phoneInput } from "./common";

export const loginSchema = z.object({
    identifier: z.string().trim().min(3, "Enter your email or phone").max(120, "Too long"),
    password: z.string().min(1, "Enter your password").max(72, "Too long"),
});

export const registerSchema = z.object({
    name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
    phone: phoneInput,
    // [CONFIRM] email optional when a phone is given
    email: z
        .string()
        .trim()
        .max(120, "Too long")
        .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters").max(72, "Too long"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;