import { afterEach, describe, expect, it, vi } from "vitest";

describe("rateLimitAsync garbage collection", () => {
    afterEach(() => vi.useRealTimers());

    it("does not evict a long-window bucket when a short-window key triggers GC", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        vi.resetModules();
        const { rateLimitAsync } = await import("@/server/security/rateLimit");

        // 5 hits per 15 minutes: exhaust it.
        for (let i = 0; i < 5; i++) expect(await rateLimitAsync("forgot:1.2.3.4", 5, 15 * 60_000)).toBe(true);
        expect(await rateLimitAsync("forgot:1.2.3.4", 5, 15 * 60_000)).toBe(false);

        // 6 minutes later an unrelated 60s-window key runs the GC sweep.
        vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
        await rateLimitAsync("admin:someone", 240, 60_000);

        // Still inside the 15-minute window: must stay blocked.
        expect(await rateLimitAsync("forgot:1.2.3.4", 5, 15 * 60_000)).toBe(false);
    });

    it("still evicts buckets whose own window has elapsed", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        vi.resetModules();
        const { rateLimitAsync } = await import("@/server/security/rateLimit");
        for (let i = 0; i < 3; i++) await rateLimitAsync("short", 3, 60_000);
        expect(await rateLimitAsync("short", 3, 60_000)).toBe(false);
        vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
        expect(await rateLimitAsync("short", 3, 60_000)).toBe(true);
    });
});
