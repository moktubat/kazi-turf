import { z } from "zod";

// Common weak passwords — extend as needed.
const WEAK_PASSWORDS = new Set([
    "password", "password123", "password1234", "12345678", "123456789",
    "qwerty123", "abc12345", "letmein!", "welcome123", "admin123",
    "demo@12345", "demo12345", "iloveyou1", "monkey123",
]);

const hasLetter = /[a-zA-Z]/;
const hasDigit = /[0-9]/;
const hasSpecial = /[^a-zA-Z0-9]/;
const hasUpper = /[A-Z]/;
const hasLower = /[a-z]/;

/** Customer password: min 8 chars, must contain a letter and a digit, not in banlist. */
export const customerPasswordSchema = z
    .string()
    .min(8, "Use at least 8 characters")
    .max(72, "Too long")
    .refine((v) => hasLetter.test(v) && hasDigit.test(v), "Use both letters and digits")
    .refine((v) => !WEAK_PASSWORDS.has(v.toLowerCase()), "This password is too common");

/** Staff/admin password: min 12 chars, mixed case + digit + symbol, not in banlist. */
export const staffPasswordSchema = z
    .string()
    .min(12, "Staff passwords must be at least 12 characters")
    .max(72, "Too long")
    .refine((v) => hasUpper.test(v), "Include an uppercase letter")
    .refine((v) => hasLower.test(v), "Include a lowercase letter")
    .refine((v) => hasDigit.test(v), "Include a digit")
    .refine((v) => hasSpecial.test(v), "Include a symbol")
    .refine((v) => !WEAK_PASSWORDS.has(v.toLowerCase()), "This password is too common");

/** Password change (customer): new must differ from current. */
export function customerPasswordChangeSchema() {
    return z
        .object({
            currentPassword: z.string().min(1, "Enter your current password").max(72, "Too long"),
            newPassword: customerPasswordSchema,
        })
        .refine((v) => v.currentPassword !== v.newPassword, {
            path: ["newPassword"],
            message: "Choose a different password",
        });
}