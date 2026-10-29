// Shared by the form (client) and the /api/contact route (server re-validates).
import { z } from "zod";

const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;

export const contactSchema = z.object({
    name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
    contact: z
        .string()
        .trim()
        .min(5, "Enter a phone number or email")
        .max(120, "Too long")
        .refine(
            (v) =>
                BD_PHONE.test(v.replace(/[\s-]/g, "")) || z.string().email().safeParse(v).success,
            "Enter a valid Bangladesh phone number or email"
        ),
    message: z.string().trim().min(10, "Write at least 10 characters").max(1000, "Keep it under 1000 characters"),
    // Honeypot: real users never fill this.
    website: z.string().max(0).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;