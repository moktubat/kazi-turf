// Integration tests run against a real in-memory MongoDB replica set, so transactions and the
// unique slot-claim index behave exactly as in production. The first run downloads a mongod binary.
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Pitch, PricingRule } from "@/types";

let repl: MongoMemoryReplSet | undefined;

// TEST-ONLY sample data. The app ships with no fields and no prices (both are created
// in Setup). Tests that rely on "bogura-a/b/c" get them here; tests that build their own
// fields replace them.
const FIXTURE_PITCHES: Pitch[] = [
    ["bogura-a", "Pitch A", "Football", "7-a-side"],
    ["bogura-b", "Pitch B", "Football", "5-a-side"],
    ["bogura-c", "Cricket Net", "Cricket", "Net practice"],
].map(([id, name, sport, format]) => ({
    id, branchId: "bogura", name, sport, format, dimensions: "", surface: "Artificial turf",
    openTime: "00:00", closeTime: "24:00", slotMinutes: 90, maxConsecutiveSlots: 2,
    facilities: [], image: null, status: "ACTIVE",
}));

// Sun–Thu / Fri–Sat, off-peak 06:00–16:30 and peak 16:30–24:00 per fixture field.
const fixtureRates = (pitchId: string, p: [offWd: number, peakWd: number, offWe: number, peakWe: number]): PricingRule[] =>
    ([
        ["wd-off", [0, 1, 2, 3, 4], "06:00", "16:30", p[0], "Off-peak"],
        ["wd-peak", [0, 1, 2, 3, 4], "16:30", "24:00", p[1], "Peak"],
        ["we-off", [5, 6], "06:00", "16:30", p[2], "Off-peak"],
        ["we-peak", [5, 6], "16:30", "24:00", p[3], "Peak"],
    ] as const).map(([suffix, days, startTime, endTime, pricePerSlot, tier]) => ({
        id: `${pitchId}-${suffix}`, pitchId, days: [...days], startTime, endTime, pricePerSlot, tier,
        discountType: null, discountDirection: null, discountValue: null,
    }));
const FIXTURE_RATES: PricingRule[] = [
    ...fixtureRates("bogura-a", [2400, 3200, 2800, 3600]),
    ...fixtureRates("bogura-b", [1600, 2200, 1900, 2500]),
    ...fixtureRates("bogura-c", [1800, 2400, 2000, 2700]),
];

export async function startDb() {
    // Several test files start a mongod at once; the 10 s default is too short on a busy machine.
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60_000 }] });
    process.env.MONGODB_URI = repl.getUri();
    const { pitches } = await import("@/data/pitches");
    if (pitches.length === 0) pitches.push(...structuredClone(FIXTURE_PITCHES)); // seeded into config by connectDb
    const { pricingRules } = await import("@/data/pricing");
    if (pricingRules.length === 0) pricingRules.push(...structuredClone(FIXTURE_RATES));
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
