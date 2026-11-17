// POST /api/quote must return the server's price, and a taken slot must come back as a 409.
// Regression: the route did not await the async quoteSelection, so the body was {"quote":{}}
// and SLOT_UNAVAILABLE became an unhandled promise rejection.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
import { NextRequest } from "next/server";
import { POST as quoteRoute } from "@/app/api/quote/route";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import type { ServerUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { quote } from "@/server/pricing";
import { startDb, stopDb } from "./helpers";

const alice: ServerUser = { id: "alice", name: "Alice", role: "CUSTOMER", phone: "01711111111", email: null, branchIds: [], permissions: [] };
let TOMORROW = "";
const at = (h: number) => dhakaToUtc(TOMORROW, h * 60).toISOString();
const post = (body: unknown, ip = "203.0.113.5") =>
    quoteRoute(
        new NextRequest("http://localhost:3000/api/quote", {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": ip },
            body: JSON.stringify(body),
        })
    );

beforeAll(async () => {
    await startDb();
    TOMORROW = addDays(await todayDhaka(new Date()), 1);
}, 180_000);
afterAll(stopDb);

describe("POST /api/quote", () => {
    it("returns the server's full quote for two consecutive slots", async () => {
        const cells = [at(18), dhakaToUtc(TOMORROW, 18 * 60 + 90).toISOString()];
        const res = await post({ pitchId: "bogura-b", cellStarts: cells });
        expect(res.status).toBe(200);
        const { quote: q } = await res.json();
        const expected = quote("bogura-b", cells.map((c) => new Date(c)));
        expect(q).toMatchObject({ subtotal: expected.subtotal, total: expected.total, advance: expected.advance, balance: expected.balance });
        expect(q.lines).toHaveLength(2);
        expect(q.total).toBeGreaterThan(0);
    });

    it("a slot someone already holds is a 409 SLOT_UNAVAILABLE, not an unhandled rejection", async () => {
        const unhandled: unknown[] = [];
        const onRejection = (e: unknown) => unhandled.push(e);
        process.on("unhandledRejection", onRejection);
        try {
            await createBooking(alice, { pitchId: "bogura-b", cellStarts: [at(12)], phone: "01711111111" });
            const res = await post({ pitchId: "bogura-b", cellStarts: [at(12)] }, "203.0.113.6");
            expect(res.status).toBe(409);
            expect((await res.json()).code).toBe("SLOT_UNAVAILABLE");
            await new Promise((r) => setTimeout(r, 50));
            expect(unhandled).toHaveLength(0);
        } finally {
            process.off("unhandledRejection", onRejection);
        }
    });
});
