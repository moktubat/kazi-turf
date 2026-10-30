import { z } from "zod";
import { isBdPhone } from "@/lib/phone";

export const phoneInput = z
    .string()
    .trim()
    .refine(isBdPhone, "Enter a valid Bangladesh mobile number");