// Walk-in note ("Paid" / "Unpaid" …): quick-pick logic, request validation, and that the
// note is saved on the booking, returned to staff, and written to the audit log.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { WALKIN_NOTE_MAX, WALKIN_NOTE_PICKS, hasNotePick, toggleNotePick } from "@/lib/walkInNote";
import { AuditLogModel, BookingModel } from "@/models";
import { walkInSchema } from "@/schemas/admin";
import { getBookingDetail } from "@/server/admin/search";
import { createWalkIn, quoteWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import { startDb, stopDb } from "./helpers";

describe("note quick picks", () => {
    it("offers Paid and Unpaid", () => {
        expect(WALKIN_NOTE_PICKS).toContain("Paid");
        expect(WALKIN_NOTE_PICKS).toContain("Unpaid");
    });

    it("a pick fills an empty note", () => {
        expect(toggleNotePick("", "Paid")).toBe("Paid");
    });

    it("tapping the same pick again removes it", () => {
        expect(toggleNotePick("Paid", "Paid")).toBe("");
        expect(toggleNotePick("Paid · Paid by bKash", "Paid")).toBe("Paid by bKash");
    });

    it("Paid and Unpaid replace each other", () => {
        expect(toggleNotePick("Paid", "Unpaid")).toBe("Unpaid");
        expect(toggleNotePick("Unpaid · Balance at check-in", "Paid")).toBe("Balance at check-in · Paid");
    });

    it("other picks combine and typed text is kept", () => {
        expect(toggleNotePick("Regular team", "Paid")).toBe("Regular team · Paid");
        expect(toggleNotePick("Paid", "Paid by bKash")).toBe("Paid · Paid by bKash");
    });

    it("matching is exact and case-insensitive (\"Unpaid\" is not \"Paid\")", () => {
        expect(hasNotePick("Unpaid", "Paid")).toBe(false);
        expect(hasNotePick("paid", "Paid")).toBe(true);
        expect(hasNotePick("Paid by bKash", "Paid")).toBe(false);
        expect(toggleNotePick("paid", "Paid")).toBe("");
    });

    it("never grows past the limit", () => {
        const long = "x".repeat(WALKIN_NOTE_MAX - 2);
        expect(toggleNotePick(long, "Balance at check-in")).toBe(long);
    });
});

describe("walk-in request schema", () => {
    const base = { pitchId: "bogura-b", cellStarts: ["2026-11-19T06:00:00.000Z"], phone: "01733334444", name: "Karim", cashReceived: 2000 };

    it("note is optional and trimmed", () => {
        expect(walkInSchema.parse(base).note).toBeUndefined();
        expect(walkInSchema.parse({ ...base, note: "  Unpaid  " }).note).toBe("Unpaid");
    });

    it("rejects a note over the limit", () => {
        const r = walkInSchema.safeParse({ ...base, note: "x".repeat(WALKIN_NOTE_MAX + 1) });
        expect(r.success).toBe(false);
    });
});

describe("walk-in note is stored", () => {
    const staff: ServerUser = {
        id: "staff-bogura", name: "staff-bogura", role: "STAFF", phone: "01354490362", email: null,
        branchIds: ["bogura"], permissions: [],
    };
    let cell: (h: number) => string;

    beforeAll(async () => {
        await startDb();
        const today = await todayDhaka(new Date());
        cell = (h: number) => dhakaToUtc(addDays(today, 1), h * 60).toISOString();
    }, 180_000);
    afterAll(stopDb);

    it("saves the note on the booking, the staff DTO and the audit entry", async () => {
        const q = await quoteWalkIn(staff, "bogura-b", [cell(12)]);
        const b = await createWalkIn(staff, {
            pitchId: "bogura-b", cellStarts: [cell(12)], phone: "01733334444", name: "Karim",
            cashReceived: q.advance, note: "  Unpaid · Balance at check-in ",
        });
        expect(b.balanceDue).toBeGreaterThan(0);
        expect(b.note).toBe("Unpaid · Balance at check-in");

        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<{ note: string | null }>();
        expect(saved?.note).toBe("Unpaid · Balance at check-in");

        const detail = await getBookingDetail(staff, b.code);
        expect(detail.booking.note).toBe("Unpaid · Balance at check-in");

        const audit = await AuditLogModel.findOne({ action: "WALKIN_CREATED", entityId: b.code }).lean<{ meta: Record<string, unknown> }>();
        expect(audit?.meta.note).toBe("Unpaid · Balance at check-in");
    });

    it("a blank note is stored as no note", async () => {
        const q = await quoteWalkIn(staff, "bogura-a", [cell(15)]);
        const b = await createWalkIn(staff, {
            pitchId: "bogura-a", cellStarts: [cell(15)], phone: "01744445555", name: "Rahim",
            cashReceived: q.total, note: "   ",
        });
        expect(b.note).toBeNull();
        const audit = await AuditLogModel.findOne({ action: "WALKIN_CREATED", entityId: b.code }).lean<{ meta: Record<string, unknown> }>();
        expect(audit?.meta).not.toHaveProperty("note");
    });
});
