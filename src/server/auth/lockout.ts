import "server-only";
import { connectDb } from "@/server/db/connect";
import mongoose, { Schema, type Model } from "mongoose";

// Lockout state per identifier (email or normalised phone).
// After MAX_FAILURES failed logins, the account is locked for an exponentially
// growing window. The state is persisted in MongoDB so it survives across
// serverless instances.

const lockoutSchema = new Schema(
    {
        identifier: { type: String, required: true, unique: true },
        failures: { type: Number, default: 0 },
        lockedUntil: { type: Date, default: null },
        lastFailedAt: { type: Date, default: null },
    },
    { versionKey: false }
);

interface LockoutDoc {
    identifier: string;
    failures: number;
    lockedUntil: Date | null;
    lastFailedAt: Date | null;
}

const LockoutModel: Model<LockoutDoc> =
    (mongoose.models.Lockout as Model<LockoutDoc>) ?? mongoose.model<LockoutDoc>("Lockout", lockoutSchema);

const MAX_FAILURES = 5;
const BASE_LOCK_MS = 5 * 60_000; // 5 minutes
const MAX_LOCK_MS = 60 * 60_000; // 1 hour cap
const FAILURE_WINDOW_MS = 15 * 60_000; // a failure older than this no longer counts

export async function recordLoginFailure(
    identifier: string
): Promise<{ locked: boolean; lockedUntil: Date | null }> {
    await connectDb();
    const key = identifier.toLowerCase();
    const now = new Date();

    // Failures only count while they keep coming. Without this decay the counter never went
    // down, so after ~9 failures ANY single wrong attempt (one per hour is enough) re-locked the
    // account for an hour, letting anyone who knows a phone/email keep it locked indefinitely.
    await LockoutModel.updateOne(
        { identifier: key, lastFailedAt: { $lt: new Date(now.getTime() - FAILURE_WINDOW_MS) } },
        { $set: { failures: 0 } }
    );

    // Atomic increment of the failure counter.
    const r = await LockoutModel.findOneAndUpdate(
        { identifier: key },
        { $inc: { failures: 1 }, $set: { lastFailedAt: now } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean<{ failures?: number; lockedUntil?: Date | null }>();

    if (!r) {
        return { locked: false, lockedUntil: null };
    }

    const failures = r.failures ?? 0;

    // Not yet over the threshold — no lock.
    if (failures < MAX_FAILURES) {
        return { locked: false, lockedUntil: null };
    }

    // Exponential backoff: the Nth failure beyond the threshold locks for
    // BASE_LOCK_MS * 2^(N - MAX_FAILURES), capped at MAX_LOCK_MS.
    //   failures=5 → exponent 0 → 5 min
    //   failures=6 → exponent 1 → 10 min
    //   failures=7 → exponent 2 → 20 min
    //   failures=8 → exponent 3 → 40 min
    //   failures≥9 → capped at 60 min
    const exponent = failures - MAX_FAILURES;
    const lockMs = Math.min(BASE_LOCK_MS * Math.pow(2, exponent), MAX_LOCK_MS);
    const lockedUntil = new Date(now.getTime() + lockMs);

    // Apply the lock. A second concurrent failure racing here would just
    // overwrite lockedUntil with a slightly later value — safe.
    await LockoutModel.updateOne(
        { identifier: key },
        { $set: { lockedUntil } }
    );

    return { locked: true, lockedUntil };
}

export async function clearLoginFailures(identifier: string): Promise<void> {
    await connectDb();
    await LockoutModel.deleteOne({ identifier: identifier.toLowerCase() });
}

export async function isLocked(
    identifier: string
): Promise<{ locked: boolean; lockedUntil: Date | null }> {
    await connectDb();
    const r = await LockoutModel.findOne({
        identifier: identifier.toLowerCase(),
    }).lean<{ failures?: number; lockedUntil?: Date | null }>();

    if (!r?.lockedUntil) return { locked: false, lockedUntil: null };

    const until = new Date(r.lockedUntil);
    if (until <= new Date()) return { locked: false, lockedUntil: null };

    return { locked: true, lockedUntil: until };
}