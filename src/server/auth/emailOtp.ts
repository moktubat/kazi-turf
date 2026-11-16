// 6-digit email verification codes (customer registration and email change), sent with
// the existing Resend integration.
//
// Security:
//  - Codes are never stored. We keep HMAC-SHA256(key, recordId:code); the key is derived
//    with HKDF from CRON_SECRET (the app's own random secret), so a database leak alone
//    cannot brute-force the 1,000,000 possible codes offline.
//  - A code works for CODE_TTL_MS, once, for its email + purpose (+ account for changes).
//  - Every check is counted atomically BEFORE comparing, so parallel guesses can't beat
//    MAX_ATTEMPTS. After the last wrong guess the code is dead and a new one is needed.
//  - Send limits live in MongoDB, not instance memory, so they hold across serverless
//    instances: 60 s between codes per email, MAX_PER_EMAIL_HOUR per email per hour and
//    MAX_PER_IP per IP per IP_WINDOW_MS (IPs are stored only as an HMAC).
import "server-only";
import { createHmac, hkdfSync, randomInt, randomUUID, timingSafeEqual } from "crypto";
import type { ClientSession } from "mongoose";
import { EmailOtpModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { sendEmail } from "@/server/email";
import { verificationCodeTemplate } from "@/server/email/templates";
import { AppError } from "@/server/http";

export type OtpPurpose = "REGISTER" | "EMAIL_CHANGE";

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_ATTEMPTS = 5;
export const MAX_PER_EMAIL_HOUR = 5;
export const MAX_PER_IP = 10;
export const IP_WINDOW_MS = 15 * 60_000;
const KEEP_MS = 24 * 60 * 60_000; // records outlive the code so the limits above can count them

const PROD = process.env.NODE_ENV === "production";

let cachedKey: Buffer | null = null;
function otpKey(): Buffer {
    if (cachedKey) return cachedKey;
    let secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) {
        if (PROD) {
            console.error("[otp] CRON_SECRET is missing or shorter than 32 characters; email codes are disabled.");
            throw new AppError("VERIFICATION_UNAVAILABLE", "Email verification isn't available right now. Please contact the venue.", 503);
        }
        secret = "kazi-turf-development-only-otp-secret"; // dev/test only; never used in production
    }
    // Separate key for this purpose: knowing an OTP hash tells nothing about CRON_SECRET and vice versa.
    cachedKey = Buffer.from(hkdfSync("sha256", secret, "kazi-turf", "email-otp-v1", 32));
    return cachedKey;
}

const hmac = (data: string) => createHmac("sha256", otpKey()).update(data).digest("hex");
const codeHash = (recordId: string, code: string) => hmac(`code:${recordId}:${code}`);
const ipHash = (ip: string | undefined) => (ip ? hmac(`ip:${ip}`).slice(0, 32) : null);

export const normalizeEmail = (v: string) => v.trim().toLowerCase();

/** "rahim@gmail.com" -> "r••••@gmail.com" (shown on screen, never the full address). */
export function maskEmail(email: string): string {
    const [user, domain] = email.split("@");
    return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}

export interface CodeSent {
    sentTo: string;
    expiresInMinutes: number;
    resendInSeconds: number;
}

export async function issueEmailOtp(input: {
    email: string;
    purpose: OtpPurpose;
    userId?: string | null;
    ip?: string;
    now?: Date;
    /** Re-submitting the same email (profile re-save, "Change details" at sign-up) reuses a
     *  still-usable code instead of sending another; only an explicit "Resend code" sends anew. */
    reuseLive?: boolean;
}): Promise<CodeSent> {
    await connectDb();
    const now = input.now ?? new Date();
    const email = normalizeEmail(input.email);
    const ipH = ipHash(input.ip);

    if (input.reuseLive) {
        const live = await EmailOtpModel.findOne(
            {
                email,
                purpose: input.purpose,
                ...(input.purpose === "EMAIL_CHANGE" ? { userId: input.userId ?? "__none__" } : {}),
                consumedAt: null,
                supersededAt: null,
                expiresAt: { $gt: now },
                attempts: { $lt: MAX_ATTEMPTS },
            },
            { createdAt: 1, expiresAt: 1 },
            { sort: { createdAt: -1 } }
        ).lean<{ createdAt: Date; expiresAt: Date } | null>();
        if (live) {
            return {
                sentTo: maskEmail(email),
                expiresInMinutes: Math.max(1, Math.ceil((new Date(live.expiresAt).getTime() - now.getTime()) / 60_000)),
                resendInSeconds: Math.max(0, Math.ceil((new Date(live.createdAt).getTime() + RESEND_COOLDOWN_MS - now.getTime()) / 1000)),
            };
        }
    }

    if (PROD && !process.env.EMAIL_FROM) {
        // Without our verified domain Resend falls back to its sandbox sender, which only
        // delivers to the Resend account owner: customers would never get a code.
        console.error("[otp] EMAIL_FROM is not set; refusing to send verification codes.");
        throw new AppError("VERIFICATION_UNAVAILABLE", "Email verification isn't available right now. Please contact the venue.", 503);
    }

    if (ipH) {
        const recent = await EmailOtpModel.countDocuments({ ipHash: ipH, createdAt: { $gte: new Date(now.getTime() - IP_WINDOW_MS) } });
        if (recent >= MAX_PER_IP) {
            throw new AppError("RATE_LIMITED", "Too many codes requested from this connection. Please wait a few minutes.", 429);
        }
    }

    const last = await EmailOtpModel.findOne({ email, purpose: input.purpose }, { createdAt: 1 }, { sort: { createdAt: -1 } })
        .lean<{ createdAt: Date } | null>();
    if (last) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - (now.getTime() - new Date(last.createdAt).getTime())) / 1000);
        if (wait > 0) {
            throw new AppError("OTP_COOLDOWN", `Please wait ${wait} seconds before asking for a new code.`, 429);
        }
    }
    const lastHour = await EmailOtpModel.countDocuments({ email, createdAt: { $gte: new Date(now.getTime() - 60 * 60_000) } });
    if (lastHour >= MAX_PER_EMAIL_HOUR) {
        throw new AppError("RATE_LIMITED", "Too many codes were sent to this email. Please try again in an hour.", 429);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const id = randomUUID();

    await EmailOtpModel.create({
        id,
        email,
        purpose: input.purpose,
        userId: input.userId ?? null,
        codeHash: codeHash(id, code),
        attempts: 0,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        consumedAt: null,
        supersededAt: null,
        ipHash: ipH,
        createdAt: now,
        purgeAt: new Date(now.getTime() + KEEP_MS),
    });

    const minutes = CODE_TTL_MS / 60_000;
    const tpl = verificationCodeTemplate({ code, purpose: input.purpose, minutes });
    const result = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });

    // Codes are never written to logs, so an unsent code (no RESEND_API_KEY, Resend error) is a failure everywhere.
    if (result.error || result.skipped) {
        // Not delivered: this attempt must not count against the customer's limits.
        await EmailOtpModel.deleteOne({ id });
        throw new AppError("EMAIL_SEND_FAILED", "We couldn't send the code to that email. Check the address and try again.", 502, {
            email: "We couldn't send a code to this address",
        });
    }
    // Delivered: only the newest code works from now on (a failed send left older codes alone).
    await EmailOtpModel.updateMany(
        { email, purpose: input.purpose, id: { $ne: id }, consumedAt: null, supersededAt: null },
        { $set: { supersededAt: now } }
    );

    return { sentTo: maskEmail(email), expiresInMinutes: minutes, resendInSeconds: RESEND_COOLDOWN_MS / 1000 };
}

/**
 * Checks a code WITHOUT using it up (so a duplicate account or other failure afterwards
 * doesn't burn it). Returns the record id to pass to consumeEmailOtp inside the write.
 */
export async function checkEmailOtp(input: {
    email: string;
    purpose: OtpPurpose;
    code: string;
    userId?: string | null;
    now?: Date;
}): Promise<string> {
    await connectDb();
    const now = input.now ?? new Date();
    const live = {
        email: normalizeEmail(input.email),
        purpose: input.purpose,
        consumedAt: null,
        supersededAt: null,
        expiresAt: { $gt: now },
        ...(input.purpose === "EMAIL_CHANGE" ? { userId: input.userId ?? "__none__" } : {}),
    };
    const fieldErr = (m: string) => ({ otpCode: m });

    const rec = await EmailOtpModel.findOneAndUpdate(
        { ...live, attempts: { $lt: MAX_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { sort: { createdAt: -1 }, returnDocument: "after" }
    ).lean<{ id: string; codeHash: string; attempts: number } | null>();

    if (!rec) {
        if (await EmailOtpModel.exists(live)) {
            await EmailOtpModel.updateMany(live, { $set: { supersededAt: now } });
            throw new AppError("OTP_LOCKED", "Too many wrong codes. Ask for a new code.", 423, fieldErr("Too many wrong codes. Ask for a new code."));
        }
        throw new AppError("OTP_EXPIRED", "This code has expired or was replaced. Ask for a new code.", 410, fieldErr("Expired. Ask for a new code."));
    }

    const submitted = Buffer.from(codeHash(rec.id, input.code), "hex");
    const expected = Buffer.from(rec.codeHash, "hex");
    if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
        const left = MAX_ATTEMPTS - rec.attempts;
        if (left <= 0) {
            await EmailOtpModel.updateOne({ id: rec.id }, { $set: { supersededAt: now } });
            throw new AppError("OTP_LOCKED", "Too many wrong codes. Ask for a new code.", 423, fieldErr("Too many wrong codes. Ask for a new code."));
        }
        const msg = `Incorrect code. ${left} ${left === 1 ? "try" : "tries"} left.`;
        throw new AppError("OTP_WRONG", msg, 400, fieldErr(msg));
    }
    return rec.id;
}

/** Uses the code up. Call inside the same transaction as the write it authorises. */
export async function consumeEmailOtp(recordId: string, session: ClientSession, now: Date = new Date()) {
    const r = await EmailOtpModel.updateOne(
        { id: recordId, consumedAt: null, supersededAt: null },
        { $set: { consumedAt: now } },
        { session }
    );
    if (r.modifiedCount === 0) {
        throw new AppError("OTP_EXPIRED", "This code was already used. Ask for a new code.", 410, { otpCode: "Already used. Ask for a new code." });
    }
}
