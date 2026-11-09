import "server-only";
import { connection } from "next/server";
import { connectDb } from "@/server/db/connect";
import { ensureConfig } from "@/server/config";
import type { Branch, Pitch, Policies } from "@/types";

const DEFAULT_POLICIES: Policies = {
    slotMinutes: 90,
    advancePercent: 40,
    holdMinutes: 10,
    checkInOpensMinutesBefore: 30,
    bookingHorizonDays: 14,
    vatRatePercent: null,
    vatMode: "exclusive",
    vatRegistrationNo: "",
};

/** Convert Mongoose lean docs to plain objects with ISO string dates */
function serialize<T>(doc: unknown): T {
    if (!doc || typeof doc !== "object") return doc as T;
    return JSON.parse(JSON.stringify(doc)) as T;
}

/**
 * Get the active venue from the database.
 *
 * The venue is saved by `updateBranch` via `persistConfig` — it lives in the
 * CONFIG collection, NOT a separate branches collection. So we use
 * `ensureConfig()` to read it (same function `getSetupData` uses in admin).
 */
export async function getPublicVenue(): Promise<Branch> {
    await connection();

    try {
        await connectDb();
        const config = await ensureConfig();

        if (config && typeof config === "object") {
            // Log the config structure so we can see what's stored
            const configKeys = Object.keys(config as Record<string, unknown>);
            console.log("[public-data] ensureConfig keys:", configKeys.join(", "));

            const cfg = config as Record<string, any>;

            // Try various locations where the branch might be stored in the config.
            // Different implementations use different field names.

            // Option 1: config.branch
            if (cfg.branch && typeof cfg.branch === "object" && "name" in cfg.branch) {
                console.log("[public-data] venue found in config.branch:", cfg.branch.name);
                return serialize(cfg.branch) as Branch;
            }

            // Option 2: config.venue
            if (cfg.venue && typeof cfg.venue === "object" && "name" in cfg.venue) {
                console.log("[public-data] venue found in config.venue:", cfg.venue.name);
                return serialize(cfg.venue) as Branch;
            }

            // Option 3: config.branches array
            if (Array.isArray(cfg.branches) && cfg.branches.length > 0) {
                const b = cfg.branches.find((b: any) => b.status === "ACTIVE") ?? cfg.branches[0];
                if (b && typeof b === "object" && "name" in b) {
                    console.log("[public-data] venue found in config.branches[]:", b.name);
                    return serialize(b) as Branch;
                }
            }

            // Option 4: config itself IS the branch (has name + sportConfigs)
            if ("name" in cfg && "sportConfigs" in cfg) {
                console.log("[public-data] venue IS the config itself:", cfg.name);
                return serialize(cfg) as Branch;
            }

            // Option 5: config has name + address (might be the branch)
            if ("name" in cfg && "address" in cfg) {
                console.log("[public-data] venue found in config root:", cfg.name);
                return serialize(cfg) as Branch;
            }

            console.log("[public-data] config exists but no branch data found in it");
            console.log("[public-data] config preview:", JSON.stringify(cfg).slice(0, 500));
        } else {
            console.log("[public-data] ensureConfig returned null/empty");
        }
    } catch (e) {
        console.error("[public-data] getPublicVenue error:", e instanceof Error ? e.message : e);
    }

    console.log("[public-data] venue: using preset fallback");
    const { venue } = await import("@/data/branches");
    return venue;
}

/**
 * Get policies from the config.
 * Falls back to preset data if config is empty.
 */
export async function getPublicPolicies(): Promise<Policies> {
    await connection();

    try {
        await connectDb();
        const config = await ensureConfig();

        if (config && typeof config === "object") {
            const cfg = config as Record<string, any>;

            // Try config.policies
            if (cfg.policies && typeof cfg.policies === "object" && "slotMinutes" in cfg.policies) {
                console.log("[public-data] policies found in config.policies");
                return { ...DEFAULT_POLICIES, ...serialize<Policies>(cfg.policies) };
            }

            // Try config root (policies might be at the top level)
            if ("slotMinutes" in cfg) {
                console.log("[public-data] policies found in config root");
                return { ...DEFAULT_POLICIES, ...serialize<Policies>(cfg) };
            }

            // Try config.config.policies (nested)
            if (cfg.config?.policies && "slotMinutes" in cfg.config.policies) {
                console.log("[public-data] policies found in config.config.policies");
                return { ...DEFAULT_POLICIES, ...serialize<Policies>(cfg.config.policies) };
            }
        }

        console.log("[public-data] no policies in config, using preset fallback");
    } catch (e) {
        console.error("[public-data] getPublicPolicies error:", e instanceof Error ? e.message : e);
    }

    const { policies } = await import("@/data/site");
    return policies;
}

/**
 * Get all active pitches for the venue.
 */
export async function getPublicPitches(): Promise<Pitch[]> {
    await connection();

    try {
        const venue = await getPublicVenue();
        const { getBranchPitches } = await import("@/server/availability");
        const pitches = getBranchPitches(venue.id);
        if (pitches && pitches.length > 0) {
            console.log("[public-data] pitches fetched:", pitches.length);
            return serialize<Pitch[]>(pitches);
        }
    } catch (e) {
        console.error("[public-data] getPublicPitches error:", e instanceof Error ? e.message : e);
    }

    console.log("[public-data] pitches: using preset fallback");
    const { pitches } = await import("@/data/pitches");
    return pitches;
}