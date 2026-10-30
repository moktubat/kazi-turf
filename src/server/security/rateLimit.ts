// In-memory limiter: fine for one server process. Use Upstash Redis in production (spec §13).
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