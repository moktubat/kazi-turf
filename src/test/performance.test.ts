// Performance regressions: query counts that must not grow with the number of rows or fields,
// the payments index the dashboards rely on, and the same results as the per-row code path.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
import mongoose from "mongoose";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, ChangeRequestModel, PaymentModel, SlotClaimModel } from "@/models";
import { getBoard } from "@/server/admin/board";
import { toAdminDto } from "@/server/admin/dto";
import { getInsights } from "@/server/admin/insights";
import { searchBookings } from "@/server/admin/search";
import { getPitchAvailability, invalidateAvailability } from "@/server/availability";
import type { ServerUser } from "@/server/auth/session";
import type { Booking } from "@/types/booking";
import { startDb, stopDb } from "./helpers";

const admin: ServerUser = { id: "admin", name: "Admin", role: "SUPER_ADMIN", phone: "01711000000", email: null, branchIds: [], permissions: ["*"] };
const PITCHES = ["bogura-a", "bogura-b", "bogura-c"];
let TODAY = "";

let ops: string[] = [];
async function counting<T>(fn: () => Promise<T>): Promise<{ result: T; ops: string[] }> {
    ops = [];
    mongoose.set("debug", (coll: string, method: string) => {
        ops.push(`${coll}.${method}`);
    });
    try {
        return { result: await fn(), ops: [...ops] };
    } finally {
        mongoose.set("debug", false);
    }
}

async function seed(days: number) {
    const bookings: Record<string, unknown>[] = [];
    const claims: Record<string, unknown>[] = [];
    const pays: Record<string, unknown>[] = [];
    let n = 0;
    for (let d = -days; d <= 0; d++) {
        const date = addDays(TODAY, d);
        for (const pitchId of PITCHES) {
            for (let k = 0; k < 4; k++) {
                n++;
                const start = dhakaToUtc(date, k * 90);
                const startAt = start.toISOString();
                const id = `b${n}`;
                bookings.push({
                    id, bookingCode: `KT-${String(n).padStart(6, "0")}`, customerId: `c${n}`, customerName: `Customer ${n}`, phone: "01711111111",
                    branchId: "bogura", pitchId, date, startAt, endAt: new Date(start.getTime() + 90 * 60_000).toISOString(), cellStarts: [startAt],
                    slotCount: 1, bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", subtotal: 2000, total: 2000, vatAmount: 0,
                    advanceAmount: 500, balanceAmount: 1500, advancePercentSnapshot: 25, source: "online", holdExpiresAt: startAt, createdAt: startAt,
                });
                claims.push({ pitchId, cellStart: startAt, state: "BOOKED", bookingId: id });
                pays.push({ id: `p${n}`, bookingId: id, provider: "BKASH", kind: "ADVANCE", amount: 500, status: "SUCCESS", providerTxnId: `T${n}`, verifiedAt: startAt, createdAt: startAt });
                if (n % 2) pays.push({ id: `p${n}x`, bookingId: id, provider: "BKASH", kind: "ADVANCE", amount: 500, status: "FAILED", createdAt: new Date(start.getTime() - 1000).toISOString() });
            }
            claims.push({ pitchId, cellStart: dhakaToUtc(date, 10 * 90).toISOString(), state: "MAINTENANCE", reason: "Repair" });
        }
    }
    await BookingModel.insertMany(bookings);
    await SlotClaimModel.insertMany(claims);
    await PaymentModel.insertMany(pays);
    await ChangeRequestModel.insertMany([
        { id: "r1", bookingCode: "KT-000002", customerId: "c2", kind: "CANCEL", reason: "Cannot come", status: "OPEN", createdAt: new Date().toISOString() },
        { id: "r2", bookingCode: "KT-000005", customerId: "c5", kind: "RESCHEDULE", reason: "Later please", status: "OPEN", createdAt: new Date().toISOString() },
    ]);
}

beforeAll(async () => {
    await startDb();
    TODAY = await todayDhaka(new Date());
    await seed(9); // 10 days x 3 fields x 4 bookings = 120 bookings
}, 180_000);
afterAll(stopDb);

describe("Bookings list (searchBookings)", () => {
    it("uses a fixed number of queries, however many rows it returns", async () => {
        const small = await counting(() => searchBookings(admin, { limit: 10 }));
        const large = await counting(() => searchBookings(admin, { limit: 120 }));
        expect(small.result).toHaveLength(10);
        expect(large.result).toHaveLength(120);
        // Before the fix: 2 + 2 per row (242 for 120 rows).
        expect(large.ops.length).toBe(small.ops.length);
        expect(large.ops.length).toBeLessThanOrEqual(5);
    });

    it("returns exactly what the per-booking builder returns (payments order, open requests)", async () => {
        const now = new Date();
        const listed = await searchBookings(admin, { limit: 120 }, now);
        const docs = await BookingModel.find({ bookingCode: { $in: listed.map((b) => b.code) } }).lean<Booking[]>();
        const byCode = new Map(docs.map((d) => [d.bookingCode, d]));
        for (const row of listed) {
            expect(row).toEqual(await toAdminDto(byCode.get(row.code)!, admin, now));
        }
        expect(listed.find((b) => b.code === "KT-000002")?.changeRequest?.kind).toBe("CANCEL");
        expect(listed.find((b) => b.code === "KT-000001")?.payments.map((p) => p.status)).toEqual(["FAILED", "SUCCESS"]);
    });
});

describe("Staff Desk board (getBoard)", () => {
    it("loads the day's slot claims once, not once per field", async () => {
        invalidateAvailability();
        const { ops: o } = await counting(() => getBoard(admin, "bogura", TODAY));
        expect(o.filter((x) => x === "slotclaims.find")).toHaveLength(1);
    });

    it("shows the same cells as the shared availability function", async () => {
        const now = new Date();
        invalidateAvailability();
        const board = await getBoard(admin, "bogura", TODAY, now);
        for (const p of board.pitches) {
            const ref = await getPitchAvailability(p.id, TODAY, now, { allowStarted: true, fresh: true });
            // Board cells are availability cells plus the staff-only `booking` and `reason` fields.
            const strip = (c: (typeof p.cells)[number]) => {
                const rest: Record<string, unknown> = { ...c };
                delete rest.booking;
                delete rest.reason;
                return rest;
            };
            expect(p.cells.map(strip)).toEqual(ref);
        }
    });
});

describe("Dashboard queries use indexes", () => {
    it("the Bookings list reads only the rows it returns (no in-memory sort of every booking)", async () => {
        const sent: { filter: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
        mongoose.set("debug", (coll: string, method: string, filter: Record<string, unknown>, opts: Record<string, unknown>) => {
            if (coll === "bookings" && method === "find" && opts?.sort) sent.push({ filter, opts });
        });
        try {
            await searchBookings(admin, { limit: 20 });
        } finally {
            mongoose.set("debug", false);
        }
        expect(sent).toHaveLength(1);
        const e = (await BookingModel.find(sent[0].filter).sort({ startAt: -1 }).limit(20).explain("executionStats")) as unknown as {
            queryPlanner: { winningPlan: unknown };
            executionStats: { totalDocsExamined: number; nReturned: number };
        };
        expect(JSON.stringify(e.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"');
        expect(e.executionStats.nReturned).toBe(20);
        expect(e.executionStats.totalDocsExamined).toBeLessThanOrEqual(25); // 120 bookings seeded
    });

    it("payments by status + verifiedAt use the {status, verifiedAt} index", async () => {
        const from = dhakaToUtc(addDays(TODAY, -6), 0).toISOString();
        const to = dhakaToUtc(addDays(TODAY, 1), 0).toISOString();
        for (const filter of [
            { status: "SUCCESS", verifiedAt: { $gte: from, $lt: to } },
            { provider: "CASH", status: "SUCCESS", verifiedAt: { $gte: from, $lt: to } },
            { status: "PENDING" },
        ]) {
            const e = JSON.stringify(await PaymentModel.find(filter).explain("queryPlanner"));
            expect(e).not.toContain("COLLSCAN");
            expect(e).toContain("status_1_verifiedAt_1");
        }
    });

    it("insights' maintenance query uses the {pitchId, cellStart} index and still excludes maintenance", async () => {
        const range = { from: addDays(TODAY, -6), to: TODAY };

        // Capture the filter insights really sends, then ask MongoDB how it would run it.
        const sent: Record<string, unknown>[] = [];
        mongoose.set("debug", (coll: string, method: string, filter: Record<string, unknown>) => {
            if (coll === "slotclaims" && method === "find" && filter?.state === "MAINTENANCE") sent.push(filter);
        });
        let all;
        try {
            all = await getInsights(admin, range);
        } finally {
            mongoose.set("debug", false);
        }
        expect(sent).toHaveLength(1);
        expect(JSON.stringify(await SlotClaimModel.find(sent[0]).explain("queryPlanner"))).not.toContain("COLLSCAN");

        const football = await getInsights(admin, { ...range, sport: "Football" });
        // 7 days x 16 slots x 3 fields, minus 1 maintenance block per field per day.
        expect(all.kpis.totalCells).toBe(7 * 16 * 3 - 7 * 3);
        expect(football.kpis.totalCells).toBe(7 * 16 * 2 - 7 * 2);
    });
});
