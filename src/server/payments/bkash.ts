// Thin client for the official bKash Tokenized Checkout API. Credentials stay server-side
// and are never logged. Field names and statuses: verify against the current bKash docs.
import "server-only";
import { AppError } from "@/server/http";

interface Config {
    baseUrl: string;
    appKey: string;
    appSecret: string;
    username: string;
    password: string;
}

export interface RemotePayment {
    state: "COMPLETED" | "OPEN" | "FAILED" | "UNKNOWN";
    authorized?: boolean;
    paymentId?: string;
    trxId?: string;
    amount?: number;
    currency?: string;
    invoice?: string;
    code?: string;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function config(): Config | null {
    const { BKASH_BASE_URL, BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD } = process.env;
    if (!BKASH_BASE_URL || !BKASH_APP_KEY || !BKASH_APP_SECRET || !BKASH_USERNAME || !BKASH_PASSWORD) return null;
    return {
        baseUrl: BKASH_BASE_URL.replace(/\/+$/, ""),
        appKey: BKASH_APP_KEY,
        appSecret: BKASH_APP_SECRET,
        username: BKASH_USERNAME,
        password: BKASH_PASSWORD,
    };
}

export const bkashConfigured = () => config() !== null;

function need(): Config {
    const c = config();
    if (!c) throw new AppError("PAYMENT_UNAVAILABLE", "Online payment is not available yet.", 503);
    return c;
}

const g = globalThis as unknown as { __ktBkashToken?: { token: string; expiresAt: number } };

async function post(url: string, body: unknown, headers: Record<string, string>) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
}

async function token(c: Config, force = false): Promise<string> {
    const cached = g.__ktBkashToken;
    if (!force && cached && cached.expiresAt > Date.now()) return cached.token;

    const { json } = await post(
        `${c.baseUrl}/tokenized/checkout/token/grant`,
        { app_key: c.appKey, app_secret: c.appSecret },
        { username: c.username, password: c.password }
    );
    const t = str(json.id_token);
    if (!t) throw new Error(`bKash token grant failed (${str(json.statusCode) ?? "no code"})`);

    const ttl = Number(json.expires_in ?? 3600);
    g.__ktBkashToken = { token: t, expiresAt: Date.now() + Math.max(60, ttl - 60) * 1000 };
    return t;
}

async function authed(c: Config, path: string, body: unknown): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2; attempt++) {
        const t = await token(c, attempt === 1); // second try forces a fresh token
        const r = await post(`${c.baseUrl}${path}`, body, { Authorization: t, "X-APP-Key": c.appKey });
        if (r.status !== 401 && r.status !== 403) return r.json;
    }
    throw new Error("bKash rejected the access token");
}

/** The ONE place that maps bKash responses to our states. [CONFIRM statuses against bKash docs] */
function parse(json: Record<string, unknown>): RemotePayment {
    const status = str(json.transactionStatus);
    const trxId = str(json.trxID);
    const amount = json.amount === undefined ? undefined : Number(json.amount);
    const base = {
        paymentId: str(json.paymentID),
        trxId,
        amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
        currency: str(json.currency),
        invoice: str(json.merchantInvoiceNumber),
        code: str(json.statusCode),
    };

    if (status === "Completed" && trxId) return { ...base, state: "COMPLETED" };
    if (status === "Initiated" || status === "Authorized") {
        return { ...base, state: "OPEN", authorized: status === "Authorized" };
    }
    if (status && /fail|cancel|expire|declin|reject/i.test(status)) return { ...base, state: "FAILED" };
    return { ...base, state: "UNKNOWN" };
}

// Only ever redirect the customer to a bKash-owned host.
function assertBkashUrl(raw: string) {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const ok = u.protocol === "https:" && (host.endsWith(".bka.sh") || host.endsWith(".bkash.com") || host === "bkash.com");
    if (!ok) throw new Error("bKash returned an unexpected checkout host");
}

export async function bkashCreate(p: {
    amount: number;
    invoice: string;
    payerReference: string;
    callbackURL: string;
}): Promise<{ paymentId: string; redirectUrl: string }> {
    const c = need();
    const json = await authed(c, "/tokenized/checkout/create", {
        mode: "0011",
        payerReference: p.payerReference,
        callbackURL: p.callbackURL,
        amount: String(p.amount),
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: p.invoice,
    });

    const paymentId = str(json.paymentID);
    const url = str(json.bkashURL);
    if (str(json.statusCode) !== "0000" || !paymentId || !url) {
        throw new Error(`bKash create failed (${str(json.statusCode) ?? "no code"})`);
    }
    assertBkashUrl(url);
    return { paymentId, redirectUrl: url };
}

export async function bkashExecute(paymentId: string): Promise<RemotePayment> {
    const c = need();
    return parse(await authed(c, "/tokenized/checkout/execute", { paymentID: paymentId }));
}

export async function bkashQuery(paymentId: string): Promise<RemotePayment> {
    const c = need();
    return parse(await authed(c, "/tokenized/checkout/payment/status", { paymentID: paymentId }));
}