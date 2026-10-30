import "server-only";
import mongoose, { type ClientSession } from "mongoose";
import { allModels } from "@/models";
import { ensureConfig } from "../config";

interface Cache {
    conn: Promise<typeof mongoose> | null;
    ready: Promise<void> | null;
}

const g = globalThis as unknown as { __ktMongo?: Cache };
const cache = (g.__ktMongo ??= { conn: null, ready: null });

/** One pooled connection per process. Indexes are created once (safe to repeat: existing ones are untouched). */
export async function connectDb(): Promise<typeof mongoose> {
    if (!cache.conn) {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI is not set");

        cache.conn = mongoose
            .connect(uri, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 8000,
                autoIndex: false,
            })
            .catch((e) => {
                cache.conn = null;
                throw e;
            });
    }

    const m = await cache.conn;

    if (!cache.ready) {
        cache.ready =
            process.env.MONGO_SKIP_INDEXES === "1"
                ? Promise.resolve()
                : Promise.all(
                    allModels().map((model) => model.createIndexes())
                ).then(() => undefined);

        cache.ready.catch(() => {
            cache.ready = null;
        });
    }

    await cache.ready;
    await ensureConfig(); // Live Setup values, cached for 5 s per instance

    return m;
}

/**
 * Runs fn in one transaction (needs a replica set: Atlas has one by default).
 * Transient errors (for example a write conflict from a competing booking) are retried automatically.
 * Any other error aborts and rolls back everything fn wrote.
 */
export async function tx<T>(
    fn: (session: ClientSession) => Promise<T>
): Promise<T> {
    const m = await connectDb();
    const session = await m.startSession();

    try {
        let out!: T;

        await session.withTransaction(
            async () => {
                out = await fn(session);
            },
            {
                readConcern: { level: "snapshot" },
                writeConcern: { w: "majority" },
            }
        );

        return out;
    } finally {
        await session.endSession();
    }
}
