import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { contactSchema } from "@/schemas/contact";
import { InquiryModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { rateLimit } from "@/server/security/rateLimit";
import { sendEmail } from "@/server/email";
import { inquiryEmailTemplate } from "@/server/email/templates";
import { site } from "@/data/site";

export async function POST(req: NextRequest) {
    try {
        if (!rateLimit(`contact:${clientIp(req)}`, 5, 10 * 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many messages. Please try again later.", 429);
        }

        const raw = (await readJson(req)) as { website?: unknown } | null;
        if (raw && typeof raw.website === "string" && raw.website.length > 0) {
            return ok({ received: true }, 201);
        }

        const input = contactSchema.parse(raw);

        await connectDb();
        await InquiryModel.create({
            id: randomUUID(),
            name: input.name,
            contact: input.contact,
            message: input.message,
            status: "NEW",
            createdAt: new Date().toISOString(),
        });

        // Email the venue owner (non-blocking — failure doesn't break the API response).
        const adminEmail = process.env.ADMIN_EMAIL ?? site.email;
        if (adminEmail) {
            const tpl = inquiryEmailTemplate(input);
            void sendEmail({
                to: adminEmail,
                subject: tpl.subject,
                html: tpl.html,
                text: tpl.text,
                replyTo: input.contact.includes("@") ? input.contact : undefined,
            });
        }

        return ok({ received: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}