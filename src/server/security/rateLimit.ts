// Shared, distributed-aware rate limiting.
// - rateLimit():      in-memory, per instance (kept for non-critical paths only)
// - rateLimitAsync(): shared via Upstash Redis when configured (production-safe)
//
// In production EVERY call site MUST use rateLimitAsync. rateLimit is kept only
// for code paths where a per-instance floor is acceptable (e.g. dev/test).
import "server-only";

const buckets = new Map<string, { count: number; reset: number }>();

/** In-memory limiter — per-instance. Use only in dev or for non-critical endpoints. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    if (buckets.size > 5000) {
        for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
    }
    const b = buckets.get(key);
    if (!b || b.reset <= now) {
        buckets.set(key, { count: 1, reset: now + windowMs });
        return true;
    }
    b.count += 1;
    return b.count <= limit;
}

/**
 * Distributed limiter via Upstash Redis REST when configured.
 * Falls back to in-memory if Redis is not configured.
 *
 * In production (NODE_ENV === "production") the function HARD-FAILS if Redis
 * is not configured — this prevents silently running with per-instance limits.
 */
export async function rateLimitAsync(key: string, limit: number, windowMs: number): Promise<boolean> {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        if (process.env.NODE_ENV === "production") {
            console.error("[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set in production — refusing to fall back to per-instance limiting.");
            // Fail CLOSED: reject the request rather than allow per-instance bypass.
            return false;
        }
        return rateLimit(key, limit, windowMs);
    }

    try {
        const k = `rl:${key}`;
        const res = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify([
                ["INCR", k],
                ["PEXPIRE", k, String(windowMs), "NX"],
            ]),
            cache: "no-store",
            signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { result?: number }[];
        return Number(data[0]?.result ?? 0) <= limit;
    } catch (e) {
        console.error("[rateLimit] Upstash error, falling back to in-memory:", e instanceof Error ? e.message : e);
        return rateLimit(key, limit, windowMs);
    }
}