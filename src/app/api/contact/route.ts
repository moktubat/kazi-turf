import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { contactSchema } from "@/schemas/contact";
import { InquiryModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { sendEmail } from "@/server/email";
import { runAfterResponse } from "@/server/background";
import { inquiryEmailTemplate } from "@/server/email/templates";
import { site } from "@/data/site";
import { assertSameOrigin } from "@/server/security/origin";

export async function POST(req: NextRequest) {
    try {
        // Same-origin check only when Origin header is present (browser-initiated).
        // curl / server-to-server posts without Origin are allowed.
        const origin = req.headers.get("origin");
        if (origin) assertSameOrigin(req);

        if (!(await rateLimitAsync(`contact:${clientIp(req)}`, 5, 10 * 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many messages. Please try again later.", 429);
        }

        const raw = (await readJson(req)) as { website?: unknown } | null;

        if (raw && typeof raw.website === "string" && raw.website.length > 0) {
            return ok({ received: true }, 201);
        }

        const input = contactSchema.parse(raw);

        // Map to legacy fields so existing admin views, audit log, and DB queries keep working.
        const name = `${input.firstName} ${input.lastName}`.trim();
        const contact = input.phone;
        const messageSummary = `[${input.sport}] ${input.subject}\n\n${input.message}`;

        await connectDb();
        const now = new Date();
        const EXPIRES_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

        await InquiryModel.create({
            id: randomUUID(),
            name,
            contact,
            message: messageSummary,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            sport: input.sport,
            subject: input.subject,
            body: input.message,
            status: "NEW",
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + EXPIRES_MS),
        });

        // Email the venue owner after the response (Next's after(): the platform waits for it,
        // unlike a bare un-awaited promise, which a serverless function may drop when it exits).
        const adminEmail = process.env.ADMIN_EMAIL ?? site.email;
        if (adminEmail) {
            const tpl = inquiryEmailTemplate({
                firstName: input.firstName,
                lastName: input.lastName,
                email: input.email,
                phone: input.phone,
                sport: input.sport,
                subject: input.subject,
                message: input.message,
            });
            runAfterResponse("inquiry email", () =>
                sendEmail(
                    { to: adminEmail, subject: tpl.subject, html: tpl.html, text: tpl.text, replyTo: input.email },
                    { flow: "inquiry" }
                )
            );
        }

        return ok({ received: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}