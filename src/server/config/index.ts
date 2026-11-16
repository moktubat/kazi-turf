// Persists the editable Setup values (branches, pitches, rates, policies, refund text, legal flag).
// The objects in src/data are edited IN PLACE, so every existing reader sees changes with no refactor.
// First run: the seed values are written to the database. After that the database wins.
import "server-only";
import { branches } from "@/data/branches";
import { legalStatus, refundConfig } from "@/data/legal";
import { pitches } from "@/data/pitches";
import { priceAdjustments, pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { ConfigModel } from "@/models";
import { isDup } from "@/server/db/util";
import { AppError } from "../http";

const registry = { branches, pitches, pricingRules, priceAdjustments, policies, refundConfig, legalStatus } as const;
export type ConfigKey = keyof typeof registry;
const KEYS = Object.keys(registry) as ConfigKey[];

const TTL_MS = 5_000;
const g = globalThis as unknown as { __ktCfg?: { last: number } };
const state = (g.__ktCfg ??= { last: 0 });

// Per-module-instance state. Route bundles each get their own copy of this
// module, so the in-flight load and the "has loaded" flag must live HERE —
// sharing them through globalThis let one bundle await a load that populated
// ANOTHER bundle's versions Map, then skip its own via the shared TTL.
let run: Promise<void> | null = null;
let populated = false;

// Use performance time instead of Date.now() — Next.js 16's prerender tracker
// flags Date.now() as "unstable". performance.now() + timeOrigin is not tracked.
function nowMs(): number {
    try {
        return performance.timeOrigin + performance.now();
    } catch {
        return Date.now();
    }
}

const clone = <T>(v: T): T => structuredClone(v);

/** Arrays are replaced. Objects are merged, so a setting added in a later release keeps its default. */
function apply(target: object, value: unknown) {
    if (Array.isArray(target)) {
        if (Array.isArray(value)) target.splice(0, target.length, ...clone(value));
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(target, clone(value));
    }
}

async function seed(key: ConfigKey) {
    try {
        await ConfigModel.updateOne(
            { key },
            { $setOnInsert: { value: clone(registry[key]), updatedAt: new Date().toISOString() } },
            { upsert: true }
        );
    } catch (e) {
        if (!isDup(e)) throw e; // another instance seeded at the same moment
    }
}

const versions = new Map<ConfigKey, number>();

async function load() {
    const docs = await ConfigModel.find({ key: { $in: KEYS } }).lean<{ key: ConfigKey; value: unknown; version?: number }[]>();
    const saved = new Map(docs.map((d) => [d.key, d]));
    for (const key of KEYS) {
        const doc = saved.get(key);
        if (doc) {
            apply(registry[key], doc.value);
            // save() compares against this exact number, so the stored value
            // must be a real number. Docs created before the version field
            // existed (or restored from a dump) have none — backfill once,
            // otherwise every save 409s "reload and try again" forever, even
            // after withConfigRetry's forced reloads.
            const v = typeof doc.version === "number" && Number.isFinite(doc.version) ? doc.version : 0;
            if (doc.version !== v) {
                await ConfigModel.updateOne({ key }, { $set: { version: v } });
            }
            versions.set(key, v);
        } else {
            await seed(key);
            versions.set(key, 0);
        }
    }
    populated = true;
    state.last = nowMs();
}

/** Cheap to call often: reloads at most every 5 s per instance. `force` is used right before an edit. */
export async function ensureConfig(force = false): Promise<void> {
    if (force && run) await run.catch(() => undefined);
    if (!force && populated && nowMs() - state.last < TTL_MS) return;

    run ??= load().finally(() => {
        run = null;
    });
    try {
        await run;
    } catch (e) {
        if (!populated && state.last === 0) throw e; // never loaded: fail loudly
        console.error("[config] reload failed, using last known values:", e instanceof Error ? e.message : String(e));
        state.last = nowMs() - TTL_MS + 1_000; // retry in about a second
    }
}

async function save(key: ConfigKey) {
    const expectedVersion = versions.get(key) ?? 0;
    const set = {
        value: clone(registry[key]),
        updatedAt: new Date().toISOString(),
        version: expectedVersion + 1,
    };
    try {
        const r = await ConfigModel.updateOne(
            { key, version: expectedVersion },
            { $set: set },
            { upsert: true }
        );
        if (r.matchedCount === 0) {
            // Version mismatch — another instance wrote first.
            console.error(`[config] version conflict on "${key}": expected ${expectedVersion}, matched 0 document(s)`);
            throw new AppError("CONFIG_CONFLICT", "This was just changed by someone else. Reload and try again.", 409);
        }
        versions.set(key, expectedVersion + 1);
    } catch (e) {
        if (e instanceof AppError) throw e;
        if (!isDup(e)) throw e;
        // Lost the first-insert race: retry without upsert.
        const r = await ConfigModel.updateOne({ key, version: expectedVersion }, { $set: set });
        if (r.matchedCount === 0) {
            throw new AppError("CONFIG_CONFLICT", "This was just changed by someone else. Reload and try again.", 409);
        }
        versions.set(key, expectedVersion + 1);
    }
}

/** Call after changing the in-memory objects. On failure the database state is reloaded, so nothing stays half-applied. */
export async function persistConfig(...keys: ConfigKey[]): Promise<void> {
    try {
        for (const k of keys) await save(k);
    } catch (e) {
        await ensureConfig(true).catch(() => undefined);
        throw e;
    }
}

/**
 * Several admins share one login and save from different instances at the same
 * time. Runs `op`; if another instance won the version race (CONFIG_CONFLICT),
 * reloads the fresh config and runs `op` again instead of bouncing the admin
 * with "reload and try again". The closure MUST re-find the objects it edits on
 * every attempt — a reload replaces the in-memory arrays with fresh clones, so
 * any reference captured before the retry is stale. Three attempts covers
 * three admins saving in the same moment.
 */
export async function withConfigRetry(op: () => Promise<void>): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await op();
            return;
        } catch (e) {
            if (attempt >= 3 || !(e instanceof AppError) || e.code !== "CONFIG_CONFLICT") throw e;
            await ensureConfig(true).catch(() => undefined);
        }
    }
}