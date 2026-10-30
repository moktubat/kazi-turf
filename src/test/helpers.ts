// Integration tests run against a real in-memory MongoDB replica set, so transactions and the
// unique slot-claim index behave exactly as in production. The first run downloads a mongod binary.
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let repl: MongoMemoryReplSet | undefined;

export async function startDb() {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = repl.getUri();
    const { connectDb } = await import("@/server/db/connect");
    await connectDb(); // creates the indexes
}

export async function resetDb() {
    const { allModels } = await import("@/models");
    for (const m of allModels()) await m.deleteMany({}); // documents only: indexes stay
}

export async function stopDb() {
    await mongoose.disconnect();
    await repl?.stop();
}