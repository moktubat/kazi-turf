import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { contactSchema } from "@/schemas/contact";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { rateLimit } from "@/server/security/rateLimit";
import { store } from "@/server/store";

export async function POST(req: NextRequest) {
    try {
        if (!rateLimit(`contact:${clientIp(req)}`, 5, 10 * 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many messages. Please try again later.", 429);
        }

        const raw = (await readJson(req)) as { website?: unknown } | null;
        // Honeypot: bots fill the hidden field. Pretend success, store nothing.
        if (raw && typeof raw.website === "string" && raw.website.length > 0) {
            return ok({ received: true }, 201);
        }

        const input = contactSchema.parse(raw);

        // No mail provider yet: store the inquiry. Admin shows it (Batch 5).
        store.inquiries.push({
            id: randomUUID(),
            name: input.name,
            contact: input.contact,
            message: input.message,
            status: "NEW",
            createdAt: new Date().toISOString(),
        });

        return ok({ received: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}