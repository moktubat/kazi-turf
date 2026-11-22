// Resend delivery events (delivered / bounced / complained / delayed) for email observability.
// "Accepted" by the API is not "delivered": this is where real delivery time shows up.
// Off until RESEND_WEBHOOK_SECRET (the endpoint's signing secret, "whsec_…") is set.
import type { NextRequest } from "next/server";
import { verifyResendWebhook } from "@/server/email/webhook";

interface ResendEvent {
    type?: string;
    created_at?: string;
    data?: { email_id?: string; created_at?: string; bounce?: { type?: string; subType?: string } };
}

export async function POST(req: NextRequest) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return new Response(null, { status: 404 });

    const body = await req.text();
    const ok = verifyResendWebhook(secret, {
        id: req.headers.get("svix-id"),
        timestamp: req.headers.get("svix-timestamp"),
        signature: req.headers.get("svix-signature"),
    }, body);
    if (!ok) return new Response(null, { status: 401 });

    let ev: ResendEvent;
    try {
        ev = JSON.parse(body) as ResendEvent;
    } catch {
        return new Response(null, { status: 400 });
    }
    const sentAt = Date.parse(ev.data?.created_at ?? "");
    const eventAt = Date.parse(ev.created_at ?? "");
    const line = {
        at: new Date().toISOString(),
        evt: "email.webhook",
        type: ev.type ?? "unknown",
        messageId: ev.data?.email_id ?? null,
        // Provider-side time from "accepted" to this event (e.g. actual delivery to the inbox server).
        sinceSendMs: Number.isFinite(sentAt) && Number.isFinite(eventAt) ? eventAt - sentAt : null,
        ...(ev.data?.bounce ? { bounceType: ev.data.bounce.type ?? null, bounceSubType: ev.data.bounce.subType ?? null } : {}),
        // Recipient and subject are deliberately NOT logged (a code email's subject contains the code).
    };
    const bad = ev.type === "email.bounced" || ev.type === "email.complained" || ev.type === "email.failed";
    if (bad) console.warn(JSON.stringify(line));
    else console.info(JSON.stringify(line));
    return new Response(null, { status: 204 });
}
