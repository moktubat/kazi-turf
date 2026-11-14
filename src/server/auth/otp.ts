import "server-only";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { OtpModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { AppError } from "@/server/http";

const OTP_TTL_MS = 5 * 60_000; // 5 minutes
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
}

export async function issueOtp(phone: string): Promise<{ sent: boolean; expiresInMin: number }> {
    await connectDb();
    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Invalidate previous unverified OTPs for this phone.
    await OtpModel.updateMany(
        { phone, verified: false },
        { $set: { expiresAt: new Date(0) } }
    ).catch(() => undefined);

    await OtpModel.create({
        id: crypto.randomUUID(),
        phone,
        codeHash: hashCode(code),
        attempts: 0,
        verified: false,
        expiresAt,
        createdAt: new Date(),
    });

    // TODO: integrate an SMS provider (Twilio, Vonage, BD SMS gateway).
    // For now, log to console in dev and skip in prod.
    if (process.env.NODE_ENV !== "production") {
        console.log(`[OTP] dev code for ${phone}: ${code}`);
    } else {
        // Replace with: await sendSms(phone, `Your KaziTurf verification code is ${code}`);
        console.warn("[OTP] SMS provider not configured — OTP not sent in production.");
    }

    return { sent: true, expiresInMin: 5 };
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
    await connectDb();
    const now = new Date();
    const record = await OtpModel.findOne(
        { phone, verified: false, expiresAt: { $gt: now } },
        {},
        { sort: { createdAt: -1 } }
    ).lean<{ id: string; codeHash: string; attempts: number }>();

    if (!record) {
        throw new AppError("OTP_EXPIRED", "The code has expired. Request a new one.", 410);
    }

    if (record.attempts >= MAX_ATTEMPTS) {
        await OtpModel.deleteOne({ id: record.id });
        throw new AppError("OTP_LOCKED", "Too many attempts. Request a new code.", 423);
    }

    const submitted = Buffer.from(hashCode(code), "hex");
    const expected = Buffer.from(record.codeHash, "hex");
    const match = submitted.length === expected.length && timingSafeEqual(submitted, expected);

    if (!match) {
        await OtpModel.updateOne({ id: record.id }, { $inc: { attempts: 1 } });
        throw new AppError("OTP_WRONG", "Incorrect code.", 400);
    }

    await OtpModel.updateOne({ id: record.id }, { $set: { verified: true } });
    return true;
}