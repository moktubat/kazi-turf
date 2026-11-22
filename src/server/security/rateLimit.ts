/**
 * Sliding-window rate limiter, in-memory per serverless instance.
 *
 * Note: On Vercel (serverless), each instance keeps its own counter.
 * That means the *effective* limit across all instances is roughly
 * (limit × instance_count). To keep "Too many attempts" from firing
 * on a single innocent user, the limit numbers themselves should be
 * generous, AND we use a short sliding window so old hits drop off fast.
 *
 * For true distributed rate limiting, swap the Map for Upstash Redis:
 *   https://upstash.com/docs/redis/sdks/typescript
 */

type Hit = { at: number };

// Each bucket remembers its own window: the GC sweep must not evict a 15-minute bucket
// just because the call that triggered the sweep uses a 60-second window.
type Bucket = { hits: Hit[]; windowMs: number };

const buckets = new Map<string, Bucket>();

// Drop buckets that haven't been touched in this long.
const GC_INTERVAL_MS = 5 * 60 * 1000;
let lastGc = Date.now();

/**
 * Returns `true` if the action is allowed, `false` if rate-limited.
 * `limit` = max hits inside `windowMs`.
 */
export async function rateLimitAsync(
    key: string,
    limit: number,
    windowMs: number
): Promise<boolean> {
    const now = Date.now();

    // Cheap GC — don't let the map grow forever.
    if (now - lastGc > GC_INTERVAL_MS) {
        for (const [k, b] of buckets) {
            if (b.hits.length === 0 || now - b.hits[b.hits.length - 1].at > b.windowMs) {
                buckets.delete(k);
            }
        }
        lastGc = now;
    }

    const hits = buckets.get(key)?.hits ?? [];
    // Keep only hits inside the sliding window.
    const fresh = hits.filter((h) => now - h.at < windowMs);

    if (fresh.length >= limit) {
        buckets.set(key, { hits: fresh, windowMs });
        return false;
    }

    fresh.push({ at: now });
    buckets.set(key, { hits: fresh, windowMs });
    return true;
}

/** Reset the counter for a key (used after a successful action). */
export async function clearRateLimit(key: string): Promise<void> {
    buckets.delete(key);
}