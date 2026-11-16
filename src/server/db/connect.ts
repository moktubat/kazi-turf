import "server-only";
import mongoose, { type ClientSession } from "mongoose";
import { allModels } from "@/models";
import { AppError } from "@/server/http";
import { ensureConfig } from "../config";

interface Cache {
    conn: Promise<typeof mongoose> | null;
    ready: Promise<void> | null;
}

const g = globalThis as unknown as { __ktMongo?: Cache };
const cache = (g.__ktMongo ??= { conn: null, ready: null });

export async function connectDb(): Promise<typeof mongoose> {
    if (!cache.conn) {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error("[db] MONGODB_URI is not set (.env.local).");
            throw new AppError(
                "DB_NOT_CONFIGURED",
                "The service is temporarily unavailable. Please try again shortly.",
                500
            );
        }

        cache.conn = mongoose
            .connect(uri, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 8000,
                autoIndex: false,
            })
            .catch((e) => {
                cache.conn = null;
                // Hosts and replica-set names stay in the server log; the client gets a plain message.
                console.error("[db] connect failed (check MONGODB_URI and the Atlas IP access list):", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
                throw new AppError("DB_UNREACHABLE", "The service is temporarily unavailable. Please try again shortly.", 503);
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
    await ensureConfig();

    return m;
}

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