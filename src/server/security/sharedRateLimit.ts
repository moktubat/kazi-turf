/**
 * Rate limit shared by every server instance (MongoDB-backed, fixed window).
 *
 * The in-memory limiter (./rateLimit) is per serverless instance, so on Vercel the real limit
 * is "limit × number of warm instances". For the endpoints that protect accounts and send
 * email (login, sign-up, forgot / reset password) that is not good enough, so they also check
 * this one. Each check is one atomic upsert; TTL deletes old windows.
 *
 * Fails OPEN on a database error (logged): those endpoints cannot work without the database
 * anyway, and a hiccup in this counter must not lock every customer out.
 */
import "server-only";
import { RateLimitModel } from "@/models";
import { connectDb } from "@/server/db/connect";

export async function sharedRateLimit(key: string, limit: number, windowMs: number, now: Date = new Date()): Promise<boolean> {
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    try {
        await connectDb();
        const doc = await RateLimitModel.findOneAndUpdate(
            { _id: `${key}|${windowStart}` },
            { $inc: { count: 1 }, $setOnInsert: { key, expiresAt: new Date(windowStart + windowMs) } },
            { upsert: true, returnDocument: "after" }
        ).lean<{ count: number } | null>();
        return (doc?.count ?? 0) <= limit;
    } catch (e) {
        console.error(`[rate-limit] shared counter unavailable for ${key.split(":")[0]}; allowing:`, e instanceof Error ? e.message : e);
        return true;
    }
}

/** Forget every window of a key (e.g. the per-account login counter after a good login). */
export async function clearSharedRateLimit(key: string): Promise<void> {
    try {
        await connectDb();
        await RateLimitModel.deleteMany({ key });
    } catch {
        /* best effort */
    }
}
