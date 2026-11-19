// Check-in outside the window: reason optional (5+ chars when given) and saved with the check-in record.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dhakaParts } from "@/lib/time";
import { checkInReasonError } from "@/lib/checkInReason";
import { AuditLogModel, BookingModel, CheckInModel } from "@/models";
import { checkInSchema } from "@/schemas/admin";
import { checkIn } from "@/server/admin/operations";
import type { ServerUser } from "@/server/auth/session";
import type { Booking } from "@/types/booking";
import type { CheckIn } from "@/types/ops";
import { resetDb, startDb, stopDb } from "./helpers";

const staff: ServerUser = {
    id: "staff-bogura", name: "staff", role: "STAFF", phone: "01354490362", email: null, branchIds: ["bogura"], permissions: [],
};

// Starts in 5 hours: check-in has not opened yet (outside the window).
const mkEarly = (code: string): Booking => {
    const start = new Date(Date.now() + 5 * 60 * 60_000);
    return {
        id: `id-${code}`, bookingCode: code, customerId: "c1", customerName: "Rahim", phone: "01711112222",
        branchId: "bogura", pitchId: "bogura-b", date: dhakaParts(start).date,
        startAt: start.toISOString(), endAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
        cellStarts: [start.toISOString()], slotCount: 1, bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID",
        subtotal: 1600, vatAmount: 0, total: 1600, advanceAmount: 640, balanceAmount: 960,
        advancePercentSnapshot: 40, vatRatePercentSnapshot: null, source: "online",
        holdExpiresAt: start.toISOString(), createdAt: new Date().toISOString(),
    };
};
const NAME = { identity: { method: "NAME" as const }, collectBalance: false };
type Audit = { meta: Record<string, unknown> };

describe("checkInReasonError", () => {
    it("allows empty, rejects 1-4 chars, allows 5+", () => {
        expect(checkInReasonError("")).toBeNull();
        expect(checkInReasonError("   ")).toBeNull();
        expect(checkInReasonError("late")).not.toBeNull();
        expect(checkInReasonError(" a b ")).not.toBeNull(); // "a b" after trimming
        expect(checkInReasonError("early")).toBeNull();
        expect(checkInReasonError("x".repeat(201))).not.toBeNull();
    });
});

describe("checkInSchema overrideReason", () => {
    const parse = (overrideReason?: unknown) => checkInSchema.safeParse({ ...NAME, overrideReason });
    it("is optional; blank becomes undefined", () => {
        expect(parse(undefined).success).toBe(true);
        const blank = parse("   ");
        expect(blank.success).toBe(true);
        expect(blank.data?.overrideReason).toBeUndefined();
    });
    it("requires 5+ characters when given, and trims", () => {
        expect(parse("late").success).toBe(false);
        expect(parse("  Arrived early  ").data?.overrideReason).toBe("Arrived early");
    });
});

describe("checkIn outside the window", () => {
    beforeAll(startDb, 180_000);
    afterAll(stopDb);
    beforeEach(resetDb);

    it("succeeds with no reason and records an override with reason null", async () => {
        await BookingModel.create(mkEarly("KT-TEST44"));
        const dto = await checkIn(staff, "KT-TEST44", NAME);
        expect(dto.bookingStatus).toBe("CHECKED_IN");

        const rec = await CheckInModel.findOne({ bookingId: "id-KT-TEST44" }).lean<CheckIn>();
        expect(rec?.result).toBe("OVERRIDE");
        expect(rec?.reason).toBeNull();
        const audit = await AuditLogModel.findOne({ action: "CHECKIN_OVERRIDE" }).lean<Audit>();
        expect(audit?.meta.reason).toBeUndefined();
    });

    it("saves the reason with the check-in record and the audit log", async () => {
        await BookingModel.create(mkEarly("KT-TEST55"));
        const input = checkInSchema.parse({ ...NAME, overrideReason: "  Customer arrived early " });
        await checkIn(staff, "KT-TEST55", input);

        const rec = await CheckInModel.findOne({ bookingId: "id-KT-TEST55" }).lean<CheckIn>();
        expect(rec?.result).toBe("OVERRIDE");
        expect(rec?.reason).toBe("Customer arrived early");
        const audit = await AuditLogModel.findOne({ action: "CHECKIN_OVERRIDE" }).lean<Audit>();
        expect(audit?.meta.reason).toBe("Customer arrived early");
    });
});
