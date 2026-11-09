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
            throw new AppError(
                "DB_NOT_CONFIGURED",
                "Database is not configured. Set MONGODB_URI in .env.local (a MongoDB Atlas connection string works).",
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
                const msg = e instanceof Error ? e.message : String(e);
                throw new AppError(
                    "DB_UNREACHABLE",
                    `Could not connect to the database: ${msg}. Check MONGODB_URI and your network/Atlas IP allow-list.`,
                    500
                );
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