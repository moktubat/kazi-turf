// Keeps ONE live copy of editable config across route bundles and hot reloads.
// Setup edits mutate these objects in place, so every importer sees the change.
const g = globalThis as unknown as { __ktShared?: Record<string, unknown> };

export function shared<T extends object>(key: string, seed: T): T {
    const bag = (g.__ktShared ??= {});
    return (bag[key] ??= seed) as T;
}