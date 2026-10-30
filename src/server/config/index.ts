// Persists the editable Setup values (branches, pitches, rates, policies, refund text, legal flag).
// The objects in src/data are edited IN PLACE, so every existing reader sees changes with no refactor.
// First run: the seed values are written to the database. After that the database wins.
import "server-only";
import { branches } from "@/data/branches";
import { legalStatus, refundConfig } from "@/data/legal";
import { pitches } from "@/data/pitches";
import { pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { ConfigModel } from "@/models";
import { isDup } from "@/server/db/util";

const registry = { branches, pitches, pricingRules, policies, refundConfig, legalStatus } as const;
export type ConfigKey = keyof typeof registry;
const KEYS = Object.keys(registry) as ConfigKey[];

const TTL_MS = 5_000;
const g = globalThis as unknown as { __ktCfg?: { last: number; run: Promise<void> | null } };
const state = (g.__ktCfg ??= { last: 0, run: null });

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

async function load() {
    const docs = await ConfigModel.find({ key: { $in: KEYS } }).lean<{ key: ConfigKey; value: unknown }[]>();
    const saved = new Map(docs.map((d) => [d.key, d.value]));
    for (const key of KEYS) {
        if (saved.has(key)) apply(registry[key], saved.get(key));
        else await seed(key);
    }
    state.last = Date.now();
}

/** Cheap to call often: reloads at most every 5 s per instance. `force` is used right before an edit. */
export async function ensureConfig(force = false): Promise<void> {
    if (force && state.run) await state.run.catch(() => undefined);
    if (!force && Date.now() - state.last < TTL_MS) return;

    state.run ??= load().finally(() => {
        state.run = null;
    });
    try {
        await state.run;
    } catch (e) {
        if (state.last === 0) throw e; // never loaded: fail loudly
        console.error("[config] reload failed, using last known values");
        state.last = Date.now() - TTL_MS + 1_000; // retry in about a second
    }
}

async function save(key: ConfigKey) {
    const set = { value: clone(registry[key]), updatedAt: new Date().toISOString() };
    try {
        await ConfigModel.updateOne({ key }, { $set: set }, { upsert: true });
    } catch (e) {
        if (!isDup(e)) throw e;
        await ConfigModel.updateOne({ key }, { $set: set }); // lost the first-insert race: plain update
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