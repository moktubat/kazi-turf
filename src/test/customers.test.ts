// Customer management (Super Admin): totals, search, filters, paging, history, permissions and
// a fixed number of queries per page. Isolated in-memory MongoDB.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh() {} }) }));
import mongoose from "mongoose";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminNav } from "@/components/layout/admin/AdminNav";
import { customerFiltersFromQuery, customerQueryString } from "@/lib/customerFilters";
import { addDays, dhakaToUtc } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { BookingModel, PaymentModel, UserModel } from "@/models";
import { CUSTOMER_PAGE, getCustomerDetail, listCustomers } from "@/server/admin/customers";
import type { ServerUser } from "@/server/auth/session";
import { startDb, stopDb } from "./helpers";

const admin: ServerUser = { id: "admin", name: "Admin", role: "SUPER_ADMIN", phone: "01700000000", email: null, branchIds: [], permissions: ["*"] };
const staff: ServerUser = { id: "staff", name: "Staff", role: "STAFF", phone: "01700000001", email: null, branchIds: ["bogura"], permissions: ["pitches.edit"] };
let TODAY = "";
let n = 0;

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
function booking(customerId: string, over: Record<string, unknown>) {
    n++;
    const date = (over.date as string) ?? TODAY;
    const start = dhakaToUtc(date, ((over.slot as number) ?? n % 15) * 90);
    const startAt = start.toISOString();
    const { slot: _s, ...rest } = over;
    void _s;
    return {
        id: `b${n}`, bookingCode: `KT-${"ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(n / 24) % 24]}${"ABCDEFGHJKLMNPQRSTUVWXYZ"[n % 24]}2345`,
        customerId, customerName: "x", phone: "01711111111", branchId: "bogura", pitchId: "bogura-a", date, startAt,
        endAt: new Date(start.getTime() + 90 * 60_000).toISOString(), cellStarts: [startAt], slotCount: 1,
        bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", subtotal: 2000, total: 2000, vatAmount: 0,
        advanceAmount: 600, balanceAmount: 1400, advancePercentSnapshot: 30, source: "online", holdExpiresAt: startAt,
        createdAt: startAt, ...rest,
    };
}
const pay = (b: { id: string }, amount: number, status = "SUCCESS", provider = "BKASH", at = new Date().toISOString()) => ({
    id: `p-${b.id}-${amount}-${status}-${Math.random().toString(36).slice(2, 7)}`, bookingId: b.id, provider, kind: "ADVANCE", amount, status,
    ...(status === "SUCCESS" ? { providerTxnId: `T-${b.id}-${amount}-${Math.random().toString(36).slice(2, 7)}`, verifiedAt: at } : {}), createdAt: at,
});

let RAHIM = "";
beforeAll(async () => {
    await startDb();
    TODAY = await todayDhaka(new Date());
    const users = [];
    // 30 customers registered one day apart (newest = index 29), plus staff/admin who must never be listed.
    for (let i = 0; i < 30; i++) {
        users.push({
            id: uuid(i), name: i === 7 ? "Rahim Uddin" : `Customer ${i}`, phone: `0171${String(1000000 + i).slice(1)}`,
            email: i === 7 ? "rahim@example.com" : `c${i}@example.com`, emailVerified: i % 2 === 0,
            passwordHash: "x", role: "CUSTOMER", status: "ACTIVE", branchIds: [], permissions: [],
            createdAt: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 86_400_000).toISOString(),
        });
    }
    users.push({ id: "staff-user", name: "Staff Person", phone: "01799990001", email: "s@example.com", passwordHash: "x", role: "STAFF", status: "ACTIVE", branchIds: ["bogura"], permissions: [], createdAt: "2026-03-01T00:00:00.000Z" });
    await UserModel.insertMany(users);
    RAHIM = uuid(7);

    // Rahim: confirmed (part paid), completed (fully paid), pending, cancelled with refund pending,
    // cancelled + refunded, expired, plus a failed payment that must not count.
    const r1 = booking(RAHIM, { date: addDays(TODAY, -10), slot: 2 });
    const r2 = booking(RAHIM, { date: addDays(TODAY, -8), slot: 3, bookingStatus: "COMPLETED", paymentStatus: "PAID", balanceAmount: 1400 });
    const r3 = booking(RAHIM, { date: addDays(TODAY, 2), slot: 4, bookingStatus: "PENDING_PAYMENT", paymentStatus: "NOT_STARTED" });
    const r4 = booking(RAHIM, { date: addDays(TODAY, -6), slot: 5, bookingStatus: "CANCELLED", paymentStatus: "REFUND_PENDING" });
    const r5 = booking(RAHIM, { date: addDays(TODAY, -5), slot: 6, bookingStatus: "CANCELLED", paymentStatus: "REFUNDED" });
    const r6 = booking(RAHIM, { date: addDays(TODAY, 3), slot: 7, bookingStatus: "EXPIRED", paymentStatus: "FAILED" });
    const extra = Array.from({ length: 22 }, (_, i) => booking(RAHIM, { date: addDays(TODAY, -40 - i), slot: 8 }));
    const others = [booking(uuid(3), { date: addDays(TODAY, -1), slot: 9, bookingStatus: "EXPIRED", paymentStatus: "NOT_STARTED" })];
    const walkin = booking("walkin:01712345678", { source: "counter" });
    await BookingModel.insertMany([r1, r2, r3, r4, r5, r6, ...extra, ...others, walkin]);
    await PaymentModel.insertMany([
        pay(r1, 600), pay(r2, 600), pay(r2, 1400, "SUCCESS", "CASH"), pay(r4, 600), pay(r5, 600), pay(r6, 600, "FAILED"),
        ...extra.map((b) => pay(b, 600)),
    ]);
}, 180_000);
afterAll(stopDb);

describe("permissions", () => {
    it("only a Super Admin can list customers or open one", async () => {
        await expect(listCustomers(staff, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(getCustomerDetail(staff, RAHIM)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lists registered customers only (never staff, admins or walk-in placeholders)", async () => {
        const first = await listCustomers(admin, {});
        const all = [...first.customers];
        for (let page = 2; page <= first.pages; page++) all.push(...(await listCustomers(admin, { page })).customers);
        expect(first.total).toBe(30);
        expect(all).toHaveLength(30);
        expect(all.some((c) => c.name === "Staff Person" || c.id.startsWith("walkin:"))).toBe(false);
        await expect(getCustomerDetail(admin, "staff-user")).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(getCustomerDetail(admin, "../../etc")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
});

describe("totals", () => {
    it("counts bookings, money and refunds the way the booking system records them", async () => {
        const { customer } = await getCustomerDetail(admin, RAHIM);
        expect(customer).toMatchObject({ name: "Rahim Uddin", email: "rahim@example.com", emailVerified: false });
        expect(customer.stats).toMatchObject({
            bookings: 28,
            confirmed: 1 + 1 + 22, // confirmed + completed + the 22 older confirmed ones
            pending: 1,
            cancelled: 2,
            expired: 1,
            // successful payments only: 600 + (600 + 1400) + 600 + 600 + 22×600; the failed 600 is ignored
            paid: 600 + 2000 + 600 + 600 + 22 * 600,
            outstanding: 1400 + 22 * 1400, // part-paid live bookings only (not the fully paid one)
            refunds: 2,
            refundPending: 600,
            refunded: 600,
        });
        expect(customer.stats.lastBookingAt).toBe(dhakaToUtc(addDays(TODAY, 3), 7 * 90).toISOString());
    });
});

describe("search, filters and paging", () => {
    const names = async (f: Parameters<typeof listCustomers>[1]) => (await listCustomers(admin, f)).customers.map((c) => c.name);

    it("search by name (any case), email, and phone in any format", async () => {
        expect(await names({ q: "rahim" })).toEqual(["Rahim Uddin"]);
        expect(await names({ q: "RAHIM@EXAMPLE" })).toEqual(["Rahim Uddin"]);
        const phone = (await getCustomerDetail(admin, RAHIM)).customer.phone; // 017110000007 style
        expect(await names({ q: phone })).toEqual(["Rahim Uddin"]);
        expect(await names({ q: `+88${phone}` })).toEqual(["Rahim Uddin"]);
        expect(await names({ q: ".*" })).toEqual([]); // regex characters are literal
    });

    it("filters by booking status and booking date", async () => {
        expect(await names({ bookingStatus: "EXPIRED" })).toEqual(["Rahim Uddin", "Customer 3"]); // newest registration first
        expect(await names({ bookingStatus: "CANCELLED" })).toEqual(["Rahim Uddin"]);
        expect(await names({ from: addDays(TODAY, -1), to: addDays(TODAY, -1) })).toEqual(["Customer 3"]);
        expect(await names({ q: "Customer 1", bookingStatus: "CONFIRMED" })).toEqual([]);
    });

    it("pages cover every customer exactly once, newest registrations first", async () => {
        const first = await listCustomers(admin, {});
        expect(first.customers).toHaveLength(CUSTOMER_PAGE);
        expect(first).toMatchObject({ total: 30, page: 1, pages: 2 });
        expect(first.customers[0].name).toBe("Customer 29");
        const second = await listCustomers(admin, { page: 2 });
        expect(second).toMatchObject({ page: 2, pages: 2 });
        expect(second.customers).toHaveLength(5);
        // A page past the end shows the last real page.
        expect((await listCustomers(admin, { page: 99 })).page).toBe(2);
        const ids = [...first.customers, ...second.customers].map((c) => c.id);
        expect(new Set(ids).size).toBe(30);
    });

    it("a page of customers costs a fixed number of queries (no query per customer)", async () => {
        const ops: string[] = [];
        mongoose.set("debug", (coll: string, method: string) => ops.push(`${coll}.${method}`));
        try {
            await listCustomers(admin, {});
        } finally {
            mongoose.set("debug", false);
        }
        expect(ops.filter((o) => !o.startsWith("configs.")).length).toBeLessThanOrEqual(4); // users count, users, bookings, payments
    });
});

describe("customer history", () => {
    it("newest first, paged, each booking with its payments; status filter applies", async () => {
        const p1 = await getCustomerDetail(admin, RAHIM, {}, 20);
        expect(p1.bookings).toHaveLength(20);
        expect(p1.next).not.toBeNull();
        const p2 = await getCustomerDetail(admin, RAHIM, { before: p1.next! }, 20);
        expect(p2.bookings).toHaveLength(8);
        expect(p2.next).toBeNull();
        const all = [...p1.bookings, ...p2.bookings];
        expect(new Set(all.map((b) => b.code)).size).toBe(28);
        expect(all.map((b) => b.startAt)).toEqual([...all.map((b) => b.startAt)].sort().reverse());

        const completed = all.find((b) => b.bookingStatus === "COMPLETED")!;
        expect(completed.payments.map((p) => [p.provider, p.amount, p.status])).toEqual([["BKASH", 600, "SUCCESS"], ["CASH", 1400, "SUCCESS"]]);
        expect(completed.paid).toBe(2000);
        const expired = all.find((b) => b.bookingStatus === "EXPIRED")!;
        expect(expired.paid).toBe(0); // a failed payment is listed but not counted
        expect(expired.payments[0].status).toBe("FAILED");

        const cancelled = await getCustomerDetail(admin, RAHIM, { bookingStatus: "CANCELLED" });
        expect(cancelled.bookings.map((b) => b.paymentStatus).sort()).toEqual(["REFUNDED", "REFUND_PENDING"]);
    });
});

describe("URL filters", () => {
    it("keeps valid values and ignores anything else", () => {
        expect(customerFiltersFromQuery({ q: "  rahim  ", bookingStatus: "CANCELLED", from: "2026-01-01", to: "nope", before: "2026-01-02T00:00:00.000Z|abc" }))
            .toEqual({ q: "rahim", bookingStatus: "CANCELLED", from: "2026-01-01", before: "2026-01-02T00:00:00.000Z|abc" });
        expect(customerFiltersFromQuery({ bookingStatus: "HACKED", before: "x|y|z", q: "x".repeat(100) })).toEqual({ q: "x".repeat(60) });
        expect(customerQueryString({ q: "a b", bookingStatus: "EXPIRED" }, { before: "c" })).toBe("?q=a+b&bookingStatus=EXPIRED&before=c");
        expect(customerQueryString({})).toBe("");
    });
});

describe("navigation", () => {
    const html = (role: ServerUser["role"], variant: "bar" | "sidebar") =>
        renderToStaticMarkup(createElement(AdminNav, { role, canSetup: role !== "CUSTOMER", variant }));
    it("Customers appears for Super Admins only, in both the sidebar and the mobile bar, and links to its page", () => {
        for (const v of ["bar", "sidebar"] as const) {
            expect(html("SUPER_ADMIN", v)).toContain('href="/admin/customers"');
            expect(html("STAFF", v)).not.toContain("/admin/customers");
        }
        expect(html("STAFF", "bar")).toContain('href="/admin/bookings"');
    });
    it("the mobile bar scrolls softly (proximity snap) instead of forcing a snap on every swipe", () => {
        const bar = html("SUPER_ADMIN", "bar");
        expect(bar).toContain("snap-proximity");
        expect(bar).not.toContain("snap-mandatory");
    });
});
