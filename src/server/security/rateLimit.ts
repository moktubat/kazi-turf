// rateLimit(): in-memory, per server instance. Fine for local dev and a single process.
// rateLimitAsync(): shared limiter via Upstash Redis REST when configured (spec §13),
// falling back to the in-memory one. It never fails open.
const buckets = new Map<string, { count: number; reset: number }>();

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

export async function rateLimitAsync(key: string, limit: number, windowMs: number): Promise<boolean> {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return rateLimit(key, limit, windowMs);

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
    } catch {
        return rateLimit(key, limit, windowMs);
    }
}