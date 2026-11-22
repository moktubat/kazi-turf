import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
// Fallback is Resend's sandbox sender, which only delivers to the Resend account owner: dev only.
const FROM = process.env.EMAIL_FROM || "Kazi Sports Arena <onboarding@resend.dev>";

// One client per server instance (module scope), reused by every request on that instance.
const resend = apiKey ? new Resend(apiKey) : null;

export interface EmailMessage {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
}

export interface SendOptions {
    /** Which flow sent it, for logs only (e.g. "register_code", "password_reset"). */
    flow?: string;
    /**
     * Same key = same email. Resend keeps it for 24 h, so a retry after a timeout (when the
     * first attempt may in fact have been accepted) can never deliver the email twice.
     */
    idempotencyKey?: string;
    /** Per-attempt timeout. Resend normally answers in well under a second. */
    timeoutMs?: number;
    /** Attempts in total (1 = no retry). */
    maxAttempts?: number;
    /** Stop retrying once this much time has passed since the first attempt. */
    budgetMs?: number;
}

export interface SendResult {
    id?: string;
    skipped?: boolean;
    error?: string;
    attempts?: number;
}

const DEFAULTS = { timeoutMs: 5_000, maxAttempts: 3, budgetMs: 12_000 };
const BACKOFF_MS = [400, 1_200];

/** "r•••@example.com": enough to tell recipients apart in logs, not enough to identify one. */
function maskTo(to: string): string {
    const [user, domain] = to.split("@");
    return domain ? `${user.slice(0, 1)}•••@${domain}` : "•••";
}

/** One JSON line per event, so logs can be filtered by evt / flow. Never includes codes, tokens, subjects or bodies. */
function log(level: "info" | "warn" | "error", fields: Record<string, unknown>) {
    const line = JSON.stringify({ at: new Date().toISOString(), ...fields });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Network failures and timeouts (no status), rate limiting (429) and provider errors (5xx)
 * are temporary. Anything else (invalid address, unverified domain, bad key) will fail
 * the same way again, so it is not retried.
 */
function retryable(status: number | null | undefined): boolean {
    return status == null || status === 429 || status >= 500;
}

/**
 * Send an email via Resend: one shared client, a timeout on every attempt, and up to
 * `maxAttempts` tries with backoff for temporary failures (the same idempotency key on each
 * try, so a retry never sends twice). Never throws: returns { id } when Resend ACCEPTED the
 * email, { error } otherwise. Accepted is not delivered: delivery is reported later by
 * Resend's webhook (see /api/webhooks/resend).
 */
export async function sendEmail(msg: EmailMessage, options: SendOptions = {}): Promise<SendResult> {
    const flow = options.flow ?? "other";
    if (!resend) {
        log("warn", { evt: "email.skipped", flow, reason: "RESEND_API_KEY not set" });
        return { skipped: true };
    }
    const { timeoutMs, maxAttempts, budgetMs } = { ...DEFAULTS, ...options };
    const to = maskTo(msg.to);
    const started = performance.now();
    log("info", { evt: "email.request", flow, to, idempotent: !!options.idempotencyKey });

    let lastError = "Unknown error";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const t0 = performance.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        let status: number | null = null;
        let name = "";
        let retryAfterMs = 0;
        try {
            const { data, error, headers } = await resend.emails.send(
                { from: FROM, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: msg.replyTo },
                { ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}), signal: ctrl.signal } as never
            );
            const providerMs = Math.round(performance.now() - t0);
            if (!error && data?.id) {
                log("info", { evt: "email.accepted", flow, to, attempt, providerMs, totalMs: Math.round(performance.now() - started), messageId: data.id });
                return { id: data.id, attempts: attempt };
            }
            status = (error as { statusCode?: number | null } | null)?.statusCode ?? null;
            name = error?.name ?? "unknown";
            lastError = error?.message ?? "Resend returned no message id";
            const ra = Number(headers?.["retry-after"]);
            if (Number.isFinite(ra) && ra > 0) retryAfterMs = ra * 1000;
            if (ctrl.signal.aborted) { name = "timeout"; lastError = `No answer from Resend within ${timeoutMs} ms`; }
            log(retryable(status) ? "warn" : "error", { evt: "email.provider_error", flow, to, attempt, providerMs, status, error: name });
        } catch (e) {
            // The SDK reports errors as values; this is a safety net (e.g. a thrown abort).
            lastError = ctrl.signal.aborted ? `No answer from Resend within ${timeoutMs} ms` : e instanceof Error ? e.message : "Unknown error";
            name = ctrl.signal.aborted ? "timeout" : "exception";
            log("warn", { evt: "email.provider_error", flow, to, attempt, providerMs: Math.round(performance.now() - t0), status: null, error: name });
        } finally {
            clearTimeout(timer);
        }

        const elapsed = performance.now() - started;
        const wait = Math.max(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1], Math.min(retryAfterMs, 2_000));
        if (attempt < maxAttempts && retryable(status) && elapsed + wait + timeoutMs <= budgetMs) {
            log("warn", { evt: "email.retry", flow, to, nextAttempt: attempt + 1, waitMs: wait });
            await sleep(wait);
            continue;
        }
        log("error", { evt: "email.failed", flow, to, attempts: attempt, totalMs: Math.round(elapsed), error: name || "unknown" });
        return { error: lastError, attempts: attempt };
    }
    return { error: lastError };
}
