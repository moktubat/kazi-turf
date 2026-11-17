// Admin dashboard regressions: Bookings list paging, refunds on expired holds being findable,
// Needs Attention "View all" links, URL filters and the admin feedback copy.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
import { countLabel, actionSuccessMessage } from "@/lib/adminMessages";
import { bookingFiltersFromQuery, bookingsHref, defaultBookingFilters } from "@/lib/bookingFilters";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, PaymentModel } from "@/models";
import { bookingSearchSchema } from "@/schemas/admin";
import { getAttention } from "@/server/admin/insights";
import { searchBookingsPage, type BookingFilters } from "@/server/admin/search";
import type { ServerUser } from "@/server/auth/session";
import { startDb, stopDb } from "./helpers";

const admin: ServerUser = { id: "admin", name: "Admin", role: "SUPER_ADMIN", phone: "01711000000", email: null, branchIds: [], permissions: ["*"] };
let TODAY = "";
let n = 0;

function booking(over: Record<string, unknown>) {
    n++;
    const date = (over.date as string) ?? TODAY;
    const start = dhakaToUtc(date, ((over.slot as number) ?? 0) * 90);
    const startAt = start.toISOString();
    const code = `KT-${"ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(n / 24) % 24]}${"ABCDEFGHJKLMNPQRSTUVWXYZ"[n % 24]}2345`;
    const { slot: _slot, ...rest } = over;
    void _slot;
    return {
        id: `b${n}`, bookingCode: code, customerId: `c${n}`, customerName: `Customer ${n}`, phone: "01711111111",
        branchId: "bogura", pitchId: "bogura-a", date, startAt, endAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
        cellStarts: [startAt], slotCount: 1, bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID",
        subtotal: 2000, total: 2000, vatAmount: 0, advanceAmount: 500, balanceAmount: 1500, advancePercentSnapshot: 25,
        source: "online", holdExpiresAt: startAt, createdAt: startAt, ...rest,
    };
}

async function allPages(f: BookingFilters, limit: number) {
    const codes: string[] = [];
    let before: string | undefined;
    for (let i = 0; i < 50; i++) {
        const page = await searchBookingsPage(admin, { ...f, limit, before });
        codes.push(...page.bookings.map((b) => b.code));
        if (!page.next) return codes;
        expect(page.bookings).toHaveLength(limit);
        before = page.next;
    }
    throw new Error("paging did not end");
}

beforeAll(async () => {
    await startDb();
    TODAY = await todayDhaka(new Date());
    const docs = [];
    // 30 bookings over 5 days; three per day share the same start time (ties on startAt).
    for (let d = 0; d < 5; d++) {
        for (let k = 0; k < 6; k++) {
            docs.push(booking({ date: addDays(TODAY, -d - 1), slot: k < 3 ? 4 : k, pitchId: `bogura-${"abc"[k % 3]}` }));
        }
    }
    // Expired holds: one with a refund owed (a late payment), one plain unpaid hold.
    docs.push(booking({ date: addDays(TODAY, 2), slot: 8, bookingStatus: "EXPIRED", paymentStatus: "REFUND_PENDING", customerName: "Late Payer" }));
    docs.push(booking({ date: addDays(TODAY, 2), slot: 9, bookingStatus: "EXPIRED", paymentStatus: "FAILED", customerName: "Gave Up" }));
    // 12 cancelled bookings with refunds pending, months apart (outside the default date window).
    for (let i = 0; i < 12; i++) {
        docs.push(booking({ date: addDays(TODAY, -40 - i * 10), slot: 5, bookingStatus: "CANCELLED", paymentStatus: "REFUND_PENDING", customerName: `Refund ${i}` }));
    }
    await BookingModel.insertMany(docs);
    await PaymentModel.insertMany(
        docs.filter((b) => b.paymentStatus !== "FAILED").map((b, i) => ({
            id: `p${i}`, bookingId: b.id, provider: "BKASH", kind: "ADVANCE", amount: 500, status: "SUCCESS",
            providerTxnId: `T${i}`, verifiedAt: b.startAt, createdAt: b.startAt,
        }))
    );
}, 180_000);
afterAll(stopDb);

describe("Bookings list paging", () => {
    it("pages cover every booking exactly once, in order, even when start times tie", async () => {
        const window = { from: addDays(TODAY, -10), to: TODAY };
        const one = await searchBookingsPage(admin, { ...window, limit: 200 });
        expect(one.next).toBeNull();
        expect(one.bookings).toHaveLength(30);

        const paged = await allPages(window, 7);
        expect(paged).toEqual(one.bookings.map((b) => b.code));
        expect(new Set(paged).size).toBe(30);
    });

    it("paging works together with a text search", async () => {
        const f = { from: addDays(TODAY, -10), to: TODAY, q: "Customer 1" }; // Customer 1, 10–19
        const one = await searchBookingsPage(admin, { ...f, limit: 200 });
        expect(await allPages(f, 3)).toEqual(one.bookings.map((b) => b.code));
    });

    it("the last page has no cursor, and the API only accepts a well-formed cursor", async () => {
        const page = await searchBookingsPage(admin, { from: addDays(TODAY, -10), to: TODAY, limit: 30 });
        expect(page.next).toBeNull(); // exactly 30 match: no phantom "Load more"
        expect(bookingSearchSchema.safeParse({ before: `${new Date().toISOString()}|KT-ABC234` }).success).toBe(true);
        for (const bad of ["x", "2026-01-01|KT-ABC234", `${new Date().toISOString()}|DROP`, `${new Date().toISOString()}|KT-ABC234|x`]) {
            expect(bookingSearchSchema.safeParse({ before: bad }).success).toBe(false);
        }
    });
});

describe("refunds on expired holds are findable", () => {
    it("shown by default and under 'Refund pending'; a plain expired hold stays hidden", async () => {
        const names = async (f: BookingFilters) =>
            (await searchBookingsPage(admin, { ...f, limit: 200 })).bookings.map((b) => b.customerName);
        const window = { from: TODAY, to: addDays(TODAY, 5) };
        expect(await names(window)).toContain("Late Payer");
        expect(await names(window)).not.toContain("Gave Up");
        expect(await names({ ...window, paymentStatus: "REFUND_PENDING" })).toEqual(["Late Payer"]);
        expect((await names({ ...window, bookingStatus: "EXPIRED" })).sort()).toEqual(["Gave Up", "Late Payer"]);
    });
});

describe("Needs Attention 'View all' links", () => {
    const filtersOf = (href: string) => {
        const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
        const f = bookingFiltersFromQuery(sp, TODAY);
        return { from: f.from || undefined, to: f.to || undefined, bookingStatus: f.bookingStatus || undefined, paymentStatus: f.paymentStatus || undefined };
    };

    it("refunds and balances link to a Bookings filter that contains every item of the group", async () => {
        const groups = await getAttention(admin);
        for (const id of ["refunds", "balances"] as const) {
            const g = groups.find((x) => x.id === id)!;
            expect(g.viewAll, id).toBeTruthy();
            const listed = new Set(
                (await searchBookingsPage(admin, { ...filtersOf(g.viewAll!), limit: 200 })).bookings.map((b) => b.code)
            );
            expect(g.count, id).toBeGreaterThan(0);
            for (const item of g.items) expect(listed.has(item.code), `${id}: ${item.code}`).toBe(true);
            expect(listed.size).toBeGreaterThanOrEqual(g.count);
        }
        const refunds = groups.find((x) => x.id === "refunds")!;
        expect(refunds.count).toBe(13); // 12 cancelled + the late payment on an expired hold
    });

    it("groups that one filter cannot express have no link", async () => {
        const groups = await getAttention(admin);
        expect(groups.find((g) => g.id === "payments")?.viewAll).toBeUndefined();
        expect(groups.find((g) => g.id === "expired")?.viewAll).toBeUndefined();
    });
});

describe("Bookings filters from the URL", () => {
    const today = "2026-11-17";
    it("defaults, open requests, all dates, explicit values; junk is ignored", () => {
        expect(bookingFiltersFromQuery({}, today)).toEqual(defaultBookingFilters(today));
        expect(bookingFiltersFromQuery({ request: "open" }, today)).toMatchObject({ requestOnly: true, from: "2026-08-19", to: "2026-12-17" });
        expect(bookingFiltersFromQuery({ range: "all" }, today)).toMatchObject({ from: "", to: "" });
        expect(bookingFiltersFromQuery({ range: "all", to: "2026-11-17", paymentStatus: "REFUND_PENDING" }, today))
            .toMatchObject({ from: "", to: "2026-11-17", paymentStatus: "REFUND_PENDING" });
        expect(bookingFiltersFromQuery({ from: "nope", bookingStatus: "HACKED", paymentStatus: ["PAID", "x"] }, today))
            .toMatchObject({ from: "2026-11-10", bookingStatus: "", paymentStatus: "PAID" });
        expect(bookingsHref({ paymentStatus: "REFUND_PENDING", range: "all" })).toBe("/admin/bookings?paymentStatus=REFUND_PENDING&range=all");
    });
});

describe("admin feedback copy", () => {
    it("count line says when more bookings exist, and every booking action has a confirmation", () => {
        expect(countLabel(1, false)).toBe("1 booking");
        expect(countLabel(100, false)).toBe("100 bookings");
        expect(countLabel(100, true)).toBe("Showing 100 bookings. More match these filters.");
        for (const a of ["check-in", "collect-balance", "cancel", "refund", "request"] as const) {
            expect(actionSuccessMessage(a)).toMatch(/\.$/);
        }
    });
});
