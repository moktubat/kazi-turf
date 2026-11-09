import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "KaziTurf <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

export interface EmailMessage {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
}

/**
 * Send an email via Resend.
 *
 * Returns silently on failure — email is never allowed to break a booking
 * or contact-form flow. Errors are logged server-side only.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ id?: string; skipped?: boolean; error?: string }> {
    if (!resend) {
        console.warn("[email] RESEND_API_KEY not set — skipping send to", msg.to);
        return { skipped: true };
    }

    try {
        const { data, error } = await resend.emails.send({
            from: FROM,
            to: msg.to,
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            replyTo: msg.replyTo,
        });

        if (error) {
            console.error("[email] Resend error:", error);
            return { error: error.message };
        }

        return { id: data?.id };
    } catch (e) {
        console.error("[email] Exception:", e instanceof Error ? e.message : e);
        return { error: e instanceof Error ? e.message : "Unknown error" };
    }
}