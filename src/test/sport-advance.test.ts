// Sport-wise advance payment (Setup → Venue → each sport): any whole 0–100% for day
// (6 AM–12 AM) and night (12 AM–6 AM) slots. Each sport uses its own setting in the online
// quote, the booking, and the walk-in suggestion; 0% books online with nothing to pay; old
// sports without a setting fall back to the venue-wide Policies values; saved bookings keep
// the amounts they were made with.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { branches } from "@/data/branches";
import { pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import {
    advanceAmount, advancePercentAt, isNightStart, isValidAdvancePercent, sportAdvance, sportAdvanceLines, sportConfigFor,
} from "@/lib/advance";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, PaymentModel, SlotClaimModel } from "@/models";
import { branchUpdateSchema } from "@/schemas/setup";
import { getSetupData, updateBranch } from "@/server/admin/setup";
import { quoteWalkIn } from "@/server/admin/walkin";
import type { ServerUser } from "@/server/auth/session";
import { createBooking, getBookingForUser } from "@/server/bookings";
import { quote } from "@/server/pricing";
import type { SportConfig } from "@/types";
import type { Booking } from "@/types/booking";
import { resetDb, startDb, stopDb } from "./helpers";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

const mk = (id: string, role: ServerUser["role"], branchIds: string[] = []): ServerUser => ({
    id, name: id, role, phone: "01354490362", email: null, branchIds, permissions: [],
});
const admin = mk("admin", "SUPER_ADMIN");
const staff = mk("staff-bogura", "STAFF", ["bogura"]);
const customer = mk("cust-sport-adv", "CUSTOMER");

// Slots are 90 minutes from 00:00, so starts like 18:00, 19:30, 21:00 and 22:30 exist.
// Fixture fields (helpers.ts): bogura-a and bogura-b are Football, bogura-c is Cricket.
const FOOTBALL = "bogura-a";
const CRICKET = "bogura-c";

function setSport(name: string, adv: Partial<Pick<SportConfig, "advancePercent" | "nightAdvancePercent">>) {
    const sc = branches[0].sportConfigs.find((s) => s.name === name)!;
    delete sc.advancePercent;
    delete sc.nightAdvancePercent;
    Object.assign(sc, adv);
}

describe("advance helpers", () => {
    it.each([
        [0, 2400, 0],
        [20, 2400, 480],
        [30, 2400, 720],
        [50, 2400, 1200],
        [100, 2400, 2400],
    ])("%i%% of ৳%i is ৳%i", (pct, total, want) => {
        expect(advanceAmount(total, pct)).toBe(want);
    });

    it("a low percentage never rounds a required advance down to ৳0; 0% is exactly ৳0", () => {
        expect(advanceAmount(30, 1)).toBe(1);
        expect(advanceAmount(30, 0)).toBe(0);
        expect(advanceAmount(0, 50)).toBe(0);
    });

    it("night = slots starting 12 AM–6 AM", () => {
        expect(isNightStart(0)).toBe(true);
        expect(isNightStart(5 * 60 + 59)).toBe(true);
        expect(isNightStart(6 * 60)).toBe(false);
        expect(advancePercentAt({ advancePercent: 30, nightAdvancePercent: 100 }, 3 * 60)).toBe(100);
        expect(advancePercentAt({ advancePercent: 30, nightAdvancePercent: 100 }, 18 * 60)).toBe(30);
    });

    it("a sport without its own setting falls back to the venue-wide policy", () => {
        expect(sportAdvance(undefined, { advancePercent: 30, nightAdvancePercent: 100 })).toEqual({ advancePercent: 30, nightAdvancePercent: 100 });
        expect(sportAdvance({ advancePercent: 0 }, { advancePercent: 30, nightAdvancePercent: 100 })).toEqual({ advancePercent: 0, nightAdvancePercent: 100 });
        expect(sportAdvance({ advancePercent: 50, nightAdvancePercent: 20 }, { advancePercent: 30 })).toEqual({ advancePercent: 50, nightAdvancePercent: 20 });
    });

    it("finds the sport by name (pitches store the name) or id", () => {
        expect(sportConfigFor(branches[0], "Cricket")?.id).toBe("cricket");
        expect(sportConfigFor(branches[0], "football")?.id).toBe("football");
        expect(sportConfigFor(branches[0], "Hockey")).toBeUndefined();
    });

    it("only whole numbers 0–100 are valid", () => {
        for (const n of [0, 1, 20, 30, 50, 99, 100]) expect(isValidAdvancePercent(n)).toBe(true);
        for (const n of [-1, 101, 12.5, NaN, "30"]) expect(isValidAdvancePercent(n)).toBe(false);
    });

    it("customer wording lists each active sport's own setting", () => {
        const lines = sportAdvanceLines(
            {
                sportConfigs: [
                    { id: "badminton", name: "Badminton", image: "", active: true, advancePercent: 30, nightAdvancePercent: 30 },
                    { id: "football", name: "Football", image: "", active: true, advancePercent: 50, nightAdvancePercent: 100 },
                    { id: "tt", name: "Table Tennis", image: "", active: true, advancePercent: 0, nightAdvancePercent: 0 },
                    { id: "old", name: "Hidden", image: "", active: false, advancePercent: 10 },
                ],
            },
            { advancePercent: 30, nightAdvancePercent: 100 }
        );
        expect(lines).toEqual([
            "Badminton: 30%",
            "Football: 50% (slots starting 12 AM–6 AM: 100%, the full price)",
            "Table Tennis: no advance",
        ]);
    });
});

describe("venue schema: sport advance", () => {
    const payload = (adv: Record<string, unknown>) => ({
        ...branches[0],
        sportConfigs: branches[0].sportConfigs.map((s, i) => (i === 0 ? { ...s, ...adv } : s)),
    });

    it.each([0, 20, 30, 50, 100])("accepts %i%% for day and night", (n) => {
        expect(branchUpdateSchema.safeParse(payload({ advancePercent: n, nightAdvancePercent: n })).success).toBe(true);
    });

    it.each([-1, 101, 12.5])("rejects %s", (n) => {
        expect(branchUpdateSchema.safeParse(payload({ advancePercent: n })).success).toBe(false);
        expect(branchUpdateSchema.safeParse(payload({ nightAdvancePercent: n })).success).toBe(false);
    });

    it("still accepts a sport sent without advance fields (older clients)", () => {
        expect(branchUpdateSchema.safeParse(payload({})).success).toBe(true);
    });
});

describe("each sport uses its own advance", () => {
    let day = "";
    let cell: (h: number) => string;
    const nightRule = (pitchId: string) => ({
        id: `${pitchId}-night`, pitchId, days: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "06:00",
        pricePerSlot: 2000, tier: "Off-peak" as const, discountType: null, discountDirection: null, discountValue: null,
    });

    beforeAll(async () => {
        await startDb();
        day = addDays(await todayDhaka(new Date()), 2);
        cell = (h: number) => dhakaToUtc(day, h * 60).toISOString();
        // Fixture prices start at 06:00; add a 12–6 AM price so night slots can be quoted.
        pricingRules.push(nightRule(FOOTBALL), nightRule(CRICKET));
        Object.assign(policies, { advancePercent: 30, nightAdvancePercent: 100 });
    }, 180_000);
    beforeEach(async () => {
        await resetDb();
        setSport("Football", {});
        setSport("Cricket", {});
    });
    afterAll(stopDb);

    it.each([0, 20, 30, 50, 100])("a %i%% sport setting drives the quote", (pct) => {
        setSport("Football", { advancePercent: pct, nightAdvancePercent: pct });
        const q = quote(FOOTBALL, [new Date(cell(18))]);
        expect(q.advancePercent).toBe(pct);
        expect(q.advance).toBe(advanceAmount(q.total, pct));
        expect(q.balance).toBe(q.total - q.advance);
    });

    it("two sports at the same time use different percentages", () => {
        setSport("Football", { advancePercent: 50, nightAdvancePercent: 100 });
        setSport("Cricket", { advancePercent: 20, nightAdvancePercent: 40 });
        const f = quote(FOOTBALL, [new Date(cell(18))]);
        const c = quote(CRICKET, [new Date(cell(18))]);
        expect(f.advancePercent).toBe(50);
        expect(c.advancePercent).toBe(20);
        expect(f.advance).toBe(Math.round(f.total * 0.5));
        expect(c.advance).toBe(Math.round(c.total * 0.2));
    });

    it("night slots use the sport's own night percentage", () => {
        setSport("Football", { advancePercent: 50, nightAdvancePercent: 100 });
        setSport("Cricket", { advancePercent: 20, nightAdvancePercent: 40 });
        expect(quote(FOOTBALL, [new Date(cell(3))]).advancePercent).toBe(100);
        expect(quote(CRICKET, [new Date(cell(3))])).toMatchObject({ advancePercent: 40, advance: 800, balance: 1200 });
    });

    it("a sport with no setting of its own keeps the venue-wide policy (existing data)", () => {
        setSport("Cricket", {});
        expect(quote(CRICKET, [new Date(cell(18))]).advancePercent).toBe(30);
        expect(quote(CRICKET, [new Date(cell(3))]).advancePercent).toBe(100);
    });

    it("online booking at 50%: held until the sport's advance is paid", async () => {
        setSport("Football", { advancePercent: 50, nightAdvancePercent: 50 });
        const b = await createBooking(customer, { pitchId: FOOTBALL, cellStarts: [cell(18)], phone: "01711111111" });
        expect(b).toMatchObject({ bookingStatus: "PENDING_PAYMENT", paymentStatus: "NOT_STARTED", holdActive: true });
        expect(b.advanceAmount).toBe(Math.round(b.total * 0.5));
        expect(b.balanceAmount).toBe(b.total - b.advanceAmount);
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        expect(saved!.advancePercentSnapshot).toBe(50);
    });

    it("online booking at 100%: the full price is the advance", async () => {
        setSport("Football", { advancePercent: 100, nightAdvancePercent: 100 });
        const b = await createBooking(customer, { pitchId: FOOTBALL, cellStarts: [cell(19.5)], phone: "01711111111" });
        expect(b.advanceAmount).toBe(b.total);
        expect(b.balanceAmount).toBe(0);
    });

    it("online booking at 0%: confirmed at once, nothing online, whole total due at the venue", async () => {
        setSport("Cricket", { advancePercent: 0, nightAdvancePercent: 0 });
        const b = await createBooking(customer, { pitchId: CRICKET, cellStarts: [cell(18)], phone: "01711111111" });
        expect(b).toMatchObject({
            bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", advanceAmount: 0, advancePaid: 0, holdActive: false,
        });
        expect(b.balanceDue).toBe(b.total);
        const saved = await BookingModel.findOne({ bookingCode: b.code }).lean<Booking>();
        expect(saved!.advancePercentSnapshot).toBe(0);
        const claims = await SlotClaimModel.find({ bookingId: saved!.id }).lean<{ state: string; expiresAt?: string }[]>();
        expect(claims.map((c) => c.state)).toEqual(["BOOKED"]);
        expect(claims[0].expiresAt).toBeUndefined();
        expect(await PaymentModel.countDocuments({ bookingId: saved!.id })).toBe(0);
        // Still confirmed later (it is not a hold that can expire).
        const later = await getBookingForUser(b.code, customer, new Date(Date.now() + 60 * 60_000));
        expect(later.bookingStatus).toBe("CONFIRMED");
    });

    it("walk-ins suggest the sport's own advance", async () => {
        setSport("Cricket", { advancePercent: 20, nightAdvancePercent: 20 });
        setSport("Football", { advancePercent: 0, nightAdvancePercent: 0 });
        expect((await quoteWalkIn(staff, CRICKET, [cell(22.5)])).advancePercent).toBe(20);
        expect(await quoteWalkIn(staff, FOOTBALL, [cell(22.5)])).toMatchObject({ advancePercent: 0, advance: 0 });
    });

    it("a saved booking keeps its advance after the sport's setting changes", async () => {
        setSport("Football", { advancePercent: 30, nightAdvancePercent: 30 });
        const b = await createBooking(customer, { pitchId: FOOTBALL, cellStarts: [cell(21)], phone: "01711111111" });
        setSport("Football", { advancePercent: 80, nightAdvancePercent: 80 });
        const again = await getBookingForUser(b.code, customer);
        expect(again.advanceAmount).toBe(b.advanceAmount);
        expect(again.advanceAmount).toBe(Math.round(b.total * 0.3));
    });

    it("Setup saves each sport's advance and shows the effective value for every sport", async () => {
        setSport("Football", {});
        setSport("Cricket", {});
        const before = await getSetupData(admin, new Date());
        // Old sports show the venue-wide value they fall back to; new sports start from it.
        expect(before.venue!.sportConfigs.find((s) => s.name === "Football")).toMatchObject({ advancePercent: 30, nightAdvancePercent: 100 });
        expect(before.defaultAdvance).toEqual({ advancePercent: 30, nightAdvancePercent: 100 });

        const input = branchUpdateSchema.parse({
            ...branches[0],
            sportConfigs: branches[0].sportConfigs.map((s) =>
                s.name === "Football" ? { ...s, advancePercent: 50, nightAdvancePercent: 100 }
                    : s.name === "Cricket" ? { ...s, advancePercent: 20, nightAdvancePercent: 20 }
                        : { ...s, advancePercent: 0, nightAdvancePercent: 0 }
            ),
            touchedSportIds: branches[0].sportConfigs.map((s) => s.id),
        });
        await updateBranch(admin, input);

        const after = await getSetupData(admin, new Date());
        const by = (n: string) => after.venue!.sportConfigs.find((s) => s.name === n);
        expect(by("Football")).toMatchObject({ advancePercent: 50, nightAdvancePercent: 100 });
        expect(by("Cricket")).toMatchObject({ advancePercent: 20, nightAdvancePercent: 20 });
        expect(by("Badminton")).toMatchObject({ advancePercent: 0, nightAdvancePercent: 0 });
        expect(quote(CRICKET, [new Date(cell(18))]).advancePercent).toBe(20);
        expect(quote(FOOTBALL, [new Date(cell(18))]).advancePercent).toBe(50);
    });
});
