// The booking end-time audit must (a) classify historical bookings correctly and
// (b) be unable to change ANY data.
import mongoose from "mongoose";
import { createHash } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { dhakaToUtc } from "@/lib/time";
import { readOnly, runAudit } from "@/scripts/audit-booking-end-times";
import { startDb, stopDb } from "./helpers";

let db: Db;
const D = "2026-11-20";
const iso = (h: number, date = D) => dhakaToUtc(date, Math.round(h * 60)).toISOString();
const plus = (s: string, min: number) => new Date(new Date(s).getTime() + min * 60_000).toISOString();

const booking = (id: string, pitchId: string, starts: string[], over: Record<string, unknown> = {}) => ({
    id, bookingCode: `KT-${id.toUpperCase().padEnd(6, "X").slice(0, 6)}`, customerId: "c1", customerName: "Secret Name", phone: "01711111111",
    branchId: "bogura", pitchId, date: D, startAt: starts[0], endAt: plus(starts[starts.length - 1], 90), // old code: always +90
    cellStarts: starts, slotCount: starts.length, bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID",
    source: "online", createdAt: "2026-11-01T00:00:00.000Z", ...over,
});

async function fingerprint() {
    const out: Record<string, string> = {};
    for (const c of await db.listCollections().toArray()) {
        const docs = await db.collection(c.name).find({}).sort({ _id: 1 }).toArray();
        const idx = await db.collection(c.name).indexes();
        out[c.name] = createHash("sha256").update(JSON.stringify({ docs, idx })).digest("hex");
    }
    return out;
}

beforeAll(async () => {
    await startDb();
    db = mongoose.connection.db as unknown as Db;
    // (startDb's connectDb already seeded configs; the audit script itself never calls it.)
    await db.collection("configs").deleteMany({ key: "pitches" });
    await db.collection("configs").insertOne({
        key: "pitches",
        value: [
            { id: "f60", name: "Hour Field", slotMinutes: 60 },
            { id: "f90", name: "Classic Field", slotMinutes: 90 },
            { id: "f-now60", name: "Changed To 60", slotMinutes: 60 },
            { id: "f-now90", name: "Changed To 90", slotMinutes: 90 },
            { id: "f120", name: "Two Hour Field", slotMinutes: 120 },
        ],
    });
    await db.collection("auditlogs").insertMany([
        { id: "a1", action: "PITCH_CHANGED", entityType: "PITCH", entityId: "f-now60", at: "2026-11-10T00:00:00.000Z", meta: { pitch: "Changed To 60", slotMinutes: "90 → 60" } },
        { id: "a2", action: "PITCH_CHANGED", entityType: "PITCH", entityId: "f-now90", at: "2026-11-10T00:00:00.000Z", meta: { pitch: "Changed To 90", slotMinutes: "60 → 90" } },
        { id: "a3", action: "PITCH_CHANGED", entityType: "PITCH", entityId: "gone", at: "2026-10-01T00:00:00.000Z", meta: { change: "created", name: "Deleted Field", slotMinutes: 45 } },
    ]);
    await db.collection("bookings").insertMany([
        booking("aff60", "f60", [iso(10)]),                                   // 60-min field, stored +90 → affected
        booking("ok90", "f90", [iso(10.5)]),                                  // plain 90 → skipped
        booking("was90", "f-now60", [iso(12)]),                               // booked while 90 (before change) → not affected
        booking("was60", "f-now90", [iso(13)]),                               // booked while 60, now 90 → affected
        booking("fixed", "f60", [iso(15)], { endAt: plus(iso(15), 60), createdAt: "2026-11-16T00:00:00.000Z" }), // already correct
        booking("two", "f120", [iso(16), iso(18)], { endAt: plus(iso(18), 90) }), // gaps say 120 → affected
        booking("gone1", "gone", [iso(9)]),                                   // deleted field, history 45 → affected
        booking("mystery", "nope", [iso(8)]),                                 // deleted field, no history → review
        booking("past", "f60", [iso(10, "2026-10-05")], { bookingStatus: "COMPLETED", paymentStatus: "PAID", date: "2026-10-05" }),
    ]);
    await db.collection("payments").insertOne({ id: "p1", bookingId: "aff60", amount: 500, status: "SUCCESS" });
    await db.collection("users").insertOne({ id: "c1", name: "Secret Name", phone: "01711111111", role: "CUSTOMER" });
}, 180_000);
afterAll(stopDb);

describe("booking end-time audit", () => {
    it("classifies historical bookings and computes the expected end", async () => {
        const { rows, summary } = await runAudit(readOnly(db), new Date("2026-11-16T00:00:00.000Z"));
        const by = Object.fromEntries(rows.map((r) => [r.bookingId, r]));

        expect(by.ok90).toBeUndefined();                         // 90-min bookings are not listed
        expect(by.aff60).toMatchObject({ affected: "YES", slotMinutesAtBooking: 60, deltaMinutes: 30, stillUpcoming: true });
        expect(by.aff60.expectedEnd).toBe("2026-11-20 11:00");
        expect(by.aff60.storedEnd).toBe("2026-11-20 11:30");
        expect(by.was90).toMatchObject({ affected: "NO", slotMinutesAtBooking: 90, source: "audit history", configuredSlotMinutes: 60 });
        expect(by.was60).toMatchObject({ affected: "YES", slotMinutesAtBooking: 60, source: "audit history", configuredSlotMinutes: 90 });
        expect(by.fixed).toMatchObject({ affected: "NO", deltaMinutes: 0 });
        expect(by.two).toMatchObject({ affected: "YES", slotMinutesAtBooking: 120, source: "slot gaps", expectedEnd: "2026-11-20 20:00" });
        expect(by.gone1).toMatchObject({ affected: "YES", slotMinutesAtBooking: 45, field: "Deleted Field", fieldExists: false });
        expect(by.mystery).toMatchObject({ affected: "REVIEW", slotMinutesAtBooking: null });
        expect(by.past).toMatchObject({ affected: "YES", stillUpcoming: false });
        expect(summary).toMatchObject({ bookingsScanned: 9, ninetyMinuteSkipped: 1, affected: 5, needsReview: 1 });
    });

    it("never reads personal data into the report", async () => {
        const { rows } = await runAudit(readOnly(db));
        expect(JSON.stringify(rows)).not.toMatch(/Secret Name|01711111111/);
    });

    it("changes nothing in any collection (documents and indexes)", async () => {
        const before = await fingerprint();
        await runAudit(readOnly(db));
        await runAudit(readOnly(db));
        expect(await fingerprint()).toEqual(before);
    });

    it("blocks every write path on the guarded handle", async () => {
        const ro = readOnly(db);
        const c = ro.collection("bookings") as unknown as Record<string, (...a: unknown[]) => unknown>;
        for (const m of [
            "insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany",
            "findOneAndUpdate", "findOneAndReplace", "findOneAndDelete", "bulkWrite", "createIndex", "dropIndex", "drop", "rename",
        ]) {
            expect(() => c[m]({}, {})).toThrow(/Read-only audit/);
        }
        expect(() => ro.collection("bookings").aggregate([{ $match: {} }, { $out: "x" }])).toThrow(/Read-only audit/);
        expect(() => ro.collection("bookings").aggregate([{ $merge: { into: "x" } }])).toThrow(/Read-only audit/);
        expect(await db.collection("bookings").countDocuments({})).toBe(9);
        expect(await db.listCollections({ name: "x" }).toArray()).toHaveLength(0);
    });
});
