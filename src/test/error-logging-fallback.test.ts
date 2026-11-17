// The refund policy falls back to defaults when the database is unreachable. That fallback
// must leave a log line: before, the failure was swallowed with no trace.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/connect", () => ({
    connectDb: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:27017");
    },
}));

import { refundConfig } from "@/data/legal";
import { getPublicRefundPolicy } from "@/server/public-data";

afterEach(() => vi.restoreAllMocks());

describe("refund policy fallback", () => {
    it("shows the defaults and logs why", async () => {
        const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const policy = await getPublicRefundPolicy();
        expect(policy.tiers).toEqual(refundConfig.tiers.map((t) => ({ when: t.when, outcome: t.outcome })));
        const line = err.mock.calls.map((c) => c.join(" ")).find((l) => l.startsWith("[refund policy]"));
        expect(line).toContain("ECONNREFUSED");
    });
});
