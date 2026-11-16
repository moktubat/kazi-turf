// Regression tests for the health-check fixes: fresh availability on the write path,
// staff blocks never overwriting a customer's hold, delete guards. (OTP tests: auth-email.test.ts.)
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { addDays, dhakaParts, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, SlotClaimModel } from "@/models";
import { setBlock } from "@/server/admin/operations";
import { deletePitch } from "@/server/admin/setup";
import type { ServerUser } from "@/server/auth/session";
import { getPitchAvailability } from "@/server/availability";
import { createBooking } from "@/server/bookings";
import { resetDb, startDb, stopDb } from "./helpers";

const PITCH = "bogura-b";
const cust = (id: string): ServerUser => ({ id, name: id, role: "CUSTOMER", phone: "01711111111", email: null, branchIds: [], permissions: [] });
const admin: ServerUser = { id: "admin", name: "admin", role: "SUPER_ADMIN", phone: "01354490362", email: null, branchIds: [], permissions: [] };

let DAY = "";
const cell = (h: number) => dhakaToUtc(DAY, h * 60).toISOString();

beforeAll(async () => {
    await startDb();
    DAY = addDays(await todayDhaka(new Date()), 1);
}, 180_000);
afterAll(stopDb);
beforeEach(resetDb);

describe("booking checks read fresh availability", () => {
    it("a slot freed outside this instance (e.g. by another server) can be booked at once", async () => {
        await SlotClaimModel.create({ pitchId: PITCH, cellStart: cell(12), state: "MAINTENANCE" });
        // The display cache now remembers the slot as blocked…
        expect((await getPitchAvailability(PITCH, DAY)).find((c) => c.cellStart === cell(12))!.status).toBe("MAINTENANCE");
        // …and another instance releases it (this instance's cache is not told).
        await SlotClaimModel.deleteMany({});
        const b = await createBooking(cust("c1"), { pitchId: PITCH, cellStarts: [cell(12)], phone: "01711111111" });
        expect(b.code).toBeTruthy();
    });
});

describe("staff block vs customer hold", () => {
    it("blocking a slot whose expired hold was just replaced by a live customer hold leaves that hold alone", async () => {
        const stale = { pitchId: PITCH, cellStart: cell(15), state: "HELD", bookingId: "old", expiresAt: new Date(Date.now() - 60_000).toISOString() };
        // In the database a customer has already replaced the expired hold with a live one…
        await SlotClaimModel.create({ ...stale, bookingId: "live", expiresAt: new Date(Date.now() + 600_000).toISOString() });
        // …but staff's check still read the old, expired version.
        vi.spyOn(SlotClaimModel, "findOne").mockReturnValueOnce({ lean: () => Promise.resolve(stale) } as never);
        await expect(setBlock(admin, { pitchId: PITCH, cellStart: cell(15), block: true, kind: "MAINTENANCE", reason: "x" }))
            .rejects.toMatchObject({ code: "SLOT_TAKEN" });
        const claim = await SlotClaimModel.findOne({ pitchId: PITCH, cellStart: cell(15) }).lean<{ state: string; bookingId: string }>();
        expect(claim).toMatchObject({ state: "HELD", bookingId: "live" });
    });

    it("an expired hold can still be turned into a block", async () => {
        await SlotClaimModel.create({
            pitchId: PITCH, cellStart: cell(18), state: "HELD", bookingId: "old", expiresAt: new Date(Date.now() - 60_000).toISOString(),
        });
        await setBlock(admin, { pitchId: PITCH, cellStart: cell(18), block: true, kind: "MAINTENANCE", reason: "x" });
        const claim = await SlotClaimModel.findOne({ pitchId: PITCH, cellStart: cell(18) }).lean<Record<string, unknown>>();
        expect(claim).toMatchObject({ state: "MAINTENANCE" });
        expect(claim!.bookingId).toBeUndefined();
    });
});

describe("deleting a field", () => {
    it("is refused while a game on it is in progress", async () => {
        const start = new Date(Date.now() - 30 * 60_000);
        await BookingModel.create({
            id: "b-live", bookingCode: "KT-LIVE01", customerId: "c1", customerName: "R", phone: "01711112222",
            branchId: "bogura", pitchId: "bogura-c", date: dhakaParts(start).date,
            startAt: start.toISOString(), endAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
            cellStarts: [start.toISOString()], slotCount: 1, bookingStatus: "CHECKED_IN", paymentStatus: "PAID",
            subtotal: 1800, vatAmount: 0, total: 1800, advanceAmount: 720, balanceAmount: 0,
            advancePercentSnapshot: 40, vatRatePercentSnapshot: null, source: "online",
            holdExpiresAt: start.toISOString(), createdAt: start.toISOString(),
        });
        await SlotClaimModel.create({ pitchId: "bogura-c", cellStart: start.toISOString(), state: "BOOKED", bookingId: "b-live" });
        await expect(deletePitch(admin, "bogura-c")).rejects.toMatchObject({ code: "PITCH_IN_USE" });
        expect(await SlotClaimModel.countDocuments({ pitchId: "bogura-c" })).toBe(1); // claims untouched
    });
});
