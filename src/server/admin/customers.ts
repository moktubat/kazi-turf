// Customer management for Super Admins: registered customers with their booking and money totals,
// and one customer's full booking and payment history. Every function checks the role itself;
// filtering and paging happen in MongoDB, never in the browser.
import "server-only";
import { BookingModel, PaymentModel, UserModel } from "@/models";
import type { ServerUser } from "@/server/auth/session";
import { toDto } from "@/server/bookings";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { Booking } from "@/types/booking";
import type { CustomerBooking, CustomerFilters, CustomerPayment, CustomerRow, CustomerStats } from "@/types/customers";
import type { Payment } from "@/types/ops";
import { assertSuperAdmin } from "./access";

export const CUSTOMER_PAGE = 25;
export const HISTORY_PAGE = 20;

const LIVE = ["CONFIRMED", "CHECKED_IN", "COMPLETED"];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// User ids are UUIDs for sign-ups; seeded or older accounts may differ. Only used in an exact-match query.
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

type UserDoc = { id: string; name: string; phone: string; email?: string | null; emailVerified?: boolean; status?: "ACTIVE" | "DISABLED"; createdAt: string };

/** Paging cursor for customers: "<createdAt>|<id>" of the last row (newest registrations first). */
export const customerCursor = (u: { createdAt: string; id: string }) => `${u.createdAt}|${u.id}`;
/** Paging cursor for a customer's bookings: "<startAt>|<bookingCode>" (newest first). */
export const historyCursor = (b: { startAt: string; bookingCode: string }) => `${b.startAt}|${b.bookingCode}`;

const emptyStats = (): CustomerStats => ({
    bookings: 0, confirmed: 0, pending: 0, cancelled: 0, expired: 0,
    paid: 0, outstanding: 0, refunds: 0, refundPending: 0, refunded: 0, lastBookingAt: null,
});

/** Totals per customer from their bookings and the successful payments on them (2 queries for any number of customers). */
async function statsFor(customerIds: string[]): Promise<Map<string, CustomerStats>> {
    const out = new Map(customerIds.map((id) => [id, emptyStats()]));
    if (customerIds.length === 0) return out;
    const bookings = await BookingModel.find(
        { customerId: { $in: customerIds } },
        { id: 1, customerId: 1, bookingStatus: 1, paymentStatus: 1, balanceAmount: 1, startAt: 1 }
    ).lean<Pick<Booking, "id" | "customerId" | "bookingStatus" | "paymentStatus" | "balanceAmount" | "startAt">[]>();
    const ownerOf = new Map<string, { customerId: string; paymentStatus: string }>();
    for (const b of bookings) {
        const s = out.get(b.customerId)!;
        s.bookings++;
        if (LIVE.includes(b.bookingStatus)) s.confirmed++;
        else if (b.bookingStatus === "PENDING_PAYMENT") s.pending++;
        else if (b.bookingStatus === "CANCELLED") s.cancelled++;
        else if (b.bookingStatus === "EXPIRED") s.expired++;
        if (LIVE.includes(b.bookingStatus) && b.paymentStatus === "PARTIALLY_PAID") s.outstanding += b.balanceAmount;
        if (b.paymentStatus === "REFUND_PENDING" || b.paymentStatus === "REFUNDED") s.refunds++;
        if (!s.lastBookingAt || b.startAt > s.lastBookingAt) s.lastBookingAt = b.startAt;
        ownerOf.set(b.id, { customerId: b.customerId, paymentStatus: b.paymentStatus });
    }
    if (ownerOf.size > 0) {
        const pays = await PaymentModel.find({ bookingId: { $in: [...ownerOf.keys()] }, status: "SUCCESS" }, { bookingId: 1, amount: 1 })
            .lean<{ bookingId: string; amount: number }[]>();
        for (const p of pays) {
            const o = ownerOf.get(p.bookingId)!;
            const s = out.get(o.customerId)!;
            s.paid += p.amount;
            if (o.paymentStatus === "REFUND_PENDING") s.refundPending += p.amount;
            if (o.paymentStatus === "REFUNDED") s.refunded += p.amount;
        }
    }
    return out;
}

const toRow = (u: UserDoc, stats: CustomerStats): CustomerRow => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email ?? null,
    emailVerified: u.emailVerified === true,
    status: u.status ?? "ACTIVE",
    registeredAt: u.createdAt,
    stats,
});

/**
 * One page of registered customers, newest registrations first. Search by name, phone or email;
 * filter to customers with a booking in a status and/or dated within a range.
 */
export async function listCustomers(
    user: ServerUser,
    f: CustomerFilters,
    limit = CUSTOMER_PAGE
): Promise<{ customers: CustomerRow[]; next: string | null }> {
    assertSuperAdmin(user);
    await connectDb();

    const q: Record<string, unknown> = { role: "CUSTOMER" };
    const and: Record<string, unknown>[] = [];

    const raw = f.q?.trim() ?? "";
    if (raw) {
        const digits = /^[\d\s+-]+$/.test(raw) ? raw.replace(/\D/g, "").replace(/^88/, "") : "";
        and.push({
            $or: [
                { name: { $regex: esc(raw), $options: "i" } },
                { email: { $regex: esc(raw.toLowerCase()) } },
                ...(digits.length >= 3 ? [{ phone: { $regex: esc(digits) } }] : []),
            ],
        });
    }

    if (f.bookingStatus || f.from || f.to) {
        const bq: Record<string, unknown> = {};
        if (f.bookingStatus) bq.bookingStatus = f.bookingStatus;
        if (f.from || f.to) bq.date = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
        q.id = { $in: await BookingModel.distinct("customerId", bq) };
    }

    if (f.before) {
        const [createdAt, id] = f.before.split("|");
        and.push({ $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }] });
    }
    if (and.length) q.$and = and;

    const docs = await UserModel.find(q, { id: 1, name: 1, phone: 1, email: 1, emailVerified: 1, status: 1, createdAt: 1 })
        .sort({ createdAt: -1, id: -1 })
        .limit(limit + 1)
        .lean<UserDoc[]>();
    const page = docs.slice(0, limit);
    const stats = await statsFor(page.map((u) => u.id));
    return {
        customers: page.map((u) => toRow(u, stats.get(u.id)!)),
        next: docs.length > limit ? customerCursor(page[page.length - 1]) : null,
    };
}

/**
 * One customer's profile, totals and booking history (newest first, paged), each booking with
 * its payments. `bookingStatus` narrows the history.
 */
export async function getCustomerDetail(
    user: ServerUser,
    customerId: string,
    opts: { before?: string; bookingStatus?: string } = {},
    limit = HISTORY_PAGE,
    now: Date = new Date()
): Promise<{ customer: CustomerRow; bookings: CustomerBooking[]; next: string | null }> {
    assertSuperAdmin(user);
    if (!SAFE_ID.test(customerId)) throw new AppError("NOT_FOUND", "Customer not found.", 404);
    await connectDb();

    const u = await UserModel.findOne({ id: customerId, role: "CUSTOMER" }, { id: 1, name: 1, phone: 1, email: 1, emailVerified: 1, status: 1, createdAt: 1 })
        .lean<UserDoc | null>();
    if (!u) throw new AppError("NOT_FOUND", "Customer not found.", 404);

    const bq: Record<string, unknown> = { customerId };
    if (opts.bookingStatus) bq.bookingStatus = opts.bookingStatus;
    if (opts.before) {
        const [startAt, code] = opts.before.split("|");
        bq.$or = [{ startAt: { $lt: startAt } }, { startAt, bookingCode: { $lt: code } }];
    }

    const [stats, docs] = await Promise.all([
        statsFor([u.id]),
        BookingModel.find(bq).sort({ startAt: -1, bookingCode: -1 }).limit(limit + 1).lean(),
    ]);
    const rows = plainAll<Booking>(docs);
    const page = rows.slice(0, limit);
    const pays = page.length
        ? plainAll<Payment>(await PaymentModel.find({ bookingId: { $in: page.map((b) => b.id) } }).sort({ createdAt: 1 }).lean())
        : [];
    const paysBy = new Map<string, CustomerPayment[]>();
    for (const p of pays) {
        const list = paysBy.get(p.bookingId) ?? [];
        list.push({
            id: p.id, kind: p.kind, provider: p.provider, amount: p.amount, status: p.status,
            reference: p.providerTxnId ?? null, at: p.verifiedAt ?? p.createdAt,
        });
        paysBy.set(p.bookingId, list);
    }

    const bookings: CustomerBooking[] = page.map((b) => {
        const d = toDto(b, now);
        const payments = paysBy.get(b.id) ?? [];
        return {
            code: d.code, date: d.date, start: d.start, end: d.end, startAt: d.startAt,
            pitchName: d.pitchName, sport: d.sport, source: b.source,
            bookingStatus: d.bookingStatus, paymentStatus: d.paymentStatus,
            total: d.total,
            paid: payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0),
            balanceDue: d.balanceDue,
            createdAt: b.createdAt,
            payments,
        };
    });

    return {
        customer: toRow(u, stats.get(u.id)!),
        bookings,
        next: rows.length > limit ? historyCursor(page[page.length - 1]) : null,
    };
}
