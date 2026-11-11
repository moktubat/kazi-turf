// Shared by the form (client) and the /api/contact route (server re-validates).
import { z } from "zod";

const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;
const strip = (v: string) => v.replace(/[\s-]/g, "");

const optionalEmail = z
    .string()
    .trim()
    .max(120, "Too long")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email");

export const contactSchema = z.object({
    firstName: z.string().trim().min(2, "Enter your first name").max(40, "Too long"),
    lastName: z.string().trim().min(2, "Enter your last name").max(40, "Too long"),
    email: z
        .string()
        .trim()
        .min(5, "Enter your email")
        .max(120, "Too long")
        .refine((v) => z.string().email().safeParse(v).success, "Enter a valid email"),
    phone: z
        .string()
        .trim()
        .min(6, "Enter your phone number")
        .max(20, "Too long")
        .refine((v) => BD_PHONE.test(strip(v)), "Enter a valid Bangladesh mobile number (01XXXXXXXXX)"),
    sport: z.string().trim().min(2, "Pick a sport").max(40, "Too long"),
    subject: z.string().trim().min(3, "Add a subject").max(120, "Too long"),
    message: z.string().trim().min(10, "Write at least 10 characters").max(1000, "Keep it under 1000 characters"),
    // Honeypot: real users never fill this.
    website: z.string().max(0).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;