// Insights aggregates, "Needs attention", inquiry inbox and audit search. Super Admin only.
import "server-only";
import { branches } from "@/data/branches";
import { pitches } from "@/data/pitches";
import { policies } from "@/data/site";
import { formatBDT, formatDateShort } from "@/lib/format";
import { formatDateTime } from "@/lib/formatAdmin";
import { addDays, dhakaParts, dhakaToUtc, toHHMM, toMinutes } from "@/lib/time";
import { AuditLogModel, BookingModel, InquiryModel, PaymentModel, SlotClaimModel } from "@/models";
import { logAudit } from "@/server/audit";
import type { ServerUser } from "@/server/auth/session";
import { settleExpired } from "@/server/bookings/expire";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { Booking } from "@/types/booking";
import type { AttentionGroup, AttentionItem, AuditRow, InquiryDto, InsightsData } from "@/types/insights";
import { assertSuperAdmin } from "./access";

const COUNTED = ["CONFIRMED", "CHECKED_IN", "COMPLETED"];
export const MAX_RANGE_DAYS = 92;
const DAY_MS = 86_400_000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dowOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const spanDays = (from: string, to: string) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

export async function getInsights(
    user: ServerUser,
    f: { from: string; to: string; branch?: string },
    now: Date = new Date()
): Promise<InsightsData> {
    assertSuperAdmin(user);
    const span = spanDays(f.from, f.to);
    if (span < 1 || span > MAX_RANGE_DAYS) {
        throw new AppError("OUT_OF_RANGE", `Choose a range of up to ${MAX_RANGE_DAYS} days.`, 400);
    }
    if (f.branch && !branches.some((b) => b.id === f.branch)) throw new AppError("NOT_FOUND", "Branch not found.", 404);

    await connectDb();
    await settleExpired({}, now);

    const scope = branches.filter((b) => b.status !== "COMING_SOON" && (!f.branch || b.id === f.branch));
    const scopeIds = scope.map((b) => b.id);
    const fromIso = dhakaToUtc(f.from, 0).toISOString();
    const toIso = dhakaToUtc(addDays(f.to, 1), 0).toISOString();

    const [inRange, payDocs, pendingDocs, maintDocs] = await Promise.all([
        BookingModel.find(
            { branchId: { $in: scopeIds }, bookingStatus: { $in: COUNTED }, date: { $gte: f.from, $lte: f.to } },
            { id: 1, branchId: 1, pitchId: 1, source: 1, paymentStatus: 1, balanceAmount: 1, cellStarts: 1 }
        ).lean<any[]>(),
        PaymentModel.find({ status: "SUCCESS", verifiedAt: { $gte: fromIso, $lt: toIso } }).lean<any[]>(),
        PaymentModel.find({ status: "PENDING" }).lean<any[]>(),
        SlotClaimModel.find({ state: "MAINTENANCE", cellStart: { $gte: fromIso, $lt: toIso } }, { pitchId: 1, cellStart: 1 }).lean<any[]>(),
    ]);

    // Join payments to their bookings, limited to the branches in scope.
    const ids = [...new Set([...payDocs, ...pendingDocs].map((p) => p.bookingId))];
    const bks = await BookingModel.find(
        { id: { $in: ids }, branchId: { $in: scopeIds } },
        { id: 1, branchId: 1, paymentStatus: 1, source: 1 }
    ).lean<any[]>();
    const bkById = new Map(bks.map((b) => [b.id, b]));

    // Collected = money actually received, by payment date. Fully refunded bookings are excluded.
    const paid = payDocs.flatMap((p) => {
        const b = bkById.get(p.bookingId);
        if (!b || b.paymentStatus === "REFUNDED") return [];
        return [{ p, b, date: dhakaParts(new Date(p.verifiedAt)).date }];
    });
    const collected = paid.reduce((s, x) => s + x.p.amount, 0);

    // Pending is never counted as collected.
    const pending = pendingDocs.filter((p) => bkById.has(p.bookingId));
    const balanceDue = inRange.filter((b) => b.paymentStatus === "PARTIALLY_PAID").reduce((s, b) => s + b.balanceAmount, 0);

    /* revenue by branch and day (week buckets for long ranges) */
    const bucket: "day" | "week" = span > 31 ? "week" : "day";
    const keyOf = (d: string) => (bucket === "day" ? d : addDays(d, -dowOf(d)));
    const rowMap = new Map<string, { key: string; label: string; total: number; byBranch: Record<string, number> }>();
    for (let d = f.from; d <= f.to; d = addDays(d, 1)) {
        const key = keyOf(d);
        if (rowMap.has(key)) continue;
        const s = formatDateShort(key);
        rowMap.set(key, {
            key,
            label: bucket === "day" ? `${s.weekday} ${s.day} ${s.month}` : `Wk ${s.day} ${s.month}`,
            total: 0,
            byBranch: {},
        });
    }
    for (const { p, b, date } of paid) {
        const row = rowMap.get(keyOf(date));
        if (!row) continue;
        row.total += p.amount;
        row.byBranch[b.branchId] = (row.byBranch[b.branchId] ?? 0) + p.amount;
    }

    /* occupancy: booked slots / available slots (maintenance excluded) */
    const step = policies.slotMinutes;
    const bookedSet = new Set<string>();
    for (const b of inRange) for (const cs of b.cellStarts) bookedSet.add(`${b.pitchId}|${cs}`);
    const maint = new Set(maintDocs.map((c) => `${c.pitchId}|${c.cellStart}`));

    const total = new Map<string, number>();
    const booked = new Map<string, number>();
    const times = new Set<number>();
    let totalCells = 0;
    let bookedCells = 0;

    for (const p of pitches) {
        if (p.status !== "ACTIVE" || !scopeIds.includes(p.branchId)) continue;
        const open = toMinutes(p.openTime);
        const close = toMinutes(p.closeTime);
        for (let d = f.from; d <= f.to; d = addDays(d, 1)) {
            const dow = dowOf(d);
            for (let m = open; m + step <= close; m += step) {
                const key = `${p.id}|${dhakaToUtc(d, m).toISOString()}`;
                const isBooked = bookedSet.has(key);
                if (maint.has(key) && !isBooked) continue;
                const k = `${m}|${dow}`;
                times.add(m);
                total.set(k, (total.get(k) ?? 0) + 1);
                totalCells++;
                if (isBooked) {
                    booked.set(k, (booked.get(k) ?? 0) + 1);
                    bookedCells++;
                }
            }
        }
    }

    const sortedTimes = [...times].sort((a, b) => a - b);
    const cells = sortedTimes.map((m) =>
        DAYS.map((_, dow) => {
            const t = total.get(`${m}|${dow}`);
            return t ? Math.round(((booked.get(`${m}|${dow}`) ?? 0) / t) * 100) : null;
        })
    );

    const source = { online: { bookings: 0, collected: 0 }, counter: { bookings: 0, collected: 0 } };
    for (const b of inRange) source[b.source as "online" | "counter"].bookings++;
    for (const { p, b } of paid) source[b.source as "online" | "counter"].collected += p.amount;

    return {
        from: f.from,
        to: f.to,
        branch: f.branch ?? null,
        kpis: {
            bookings: inRange.length,
            collected,
            pendingAmount: pending.reduce((s, p) => s + p.amount, 0),
            pendingCount: pending.length,
            balanceDue,
            occupancyPct: totalCells ? Math.round((bookedCells / totalCells) * 100) : null,
            bookedCells,
            totalCells,
        },
        revenue: {
            bucket,
            branches: scope.map((b) => ({ id: b.id, name: b.name })),
            rows: [...rowMap.values()],
            total: collected,
        },
        heatmap: { times: sortedTimes.map(toHHMM), days: DAYS, cells },
        source,
    };
}

/* ---------- needs attention (current issues, not date-filtered) ---------- */
export async function getAttention(user: ServerUser, branch?: string, now: Date = new Date()): Promise<AttentionGroup[]> {
    assertSuperAdmin(user);
    await connectDb();
    const scope = branch ? { branchId: branch } : {};
    await settleExpired(scope, now);

    const nowIso = now.toISOString();
    const tenMinAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const quiet = ["CANCELLED", "ABANDONED", "CREATE_FAILED"]; // customer-cancelled or abandoned: not a problem

    const [badPays, refundDocs, balanceDocs, expiredDocs] = await Promise.all([
        PaymentModel.find({
            $or: [
                { status: "FAILED", failureReason: { $nin: quiet } },
                { status: "PENDING", createdAt: { $lt: tenMinAgo } },
                { anomaly: { $type: "string" } },
            ],
        })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean<any[]>(),
        BookingModel.find({ ...scope, paymentStatus: "REFUND_PENDING" }).limit(200).lean(),
        BookingModel.find({ ...scope, bookingStatus: { $in: COUNTED }, paymentStatus: "PARTIALLY_PAID", endAt: { $lt: nowIso } })
            .limit(200)
            .lean(),
        BookingModel.find({ ...scope, bookingStatus: "EXPIRED", createdAt: { $gte: weekAgo } }).limit(200).lean(),
    ]);

    const payBookings = new Map(
        plainAll<Booking>(await BookingModel.find({ ...scope, id: { $in: badPays.map((p) => p.bookingId) } }).lean()).map((b) => [b.id, b])
    );
    const refunds = plainAll<Booking>(refundDocs);
    const received = new Map<string, number>();
    for (const p of await PaymentModel.find({ bookingId: { $in: refunds.map((b) => b.id) }, status: "SUCCESS" }).lean<any[]>()) {
        received.set(p.bookingId, (received.get(p.bookingId) ?? 0) + p.amount);
    }

    const item = (b: Booking, title: string, detail: string): AttentionItem => ({ code: b.bookingCode, title, detail });

    const payments = new Map<string, AttentionItem>();
    for (const p of badPays) {
        const b = payBookings.get(p.bookingId);
        if (!b) continue;
        const failed = p.status === "FAILED";
        payments.set(
            b.bookingCode,
            item(
                b,
                p.anomaly ? "Payment needs review" : failed ? "Payment failed" : "Payment stuck in processing",
                `${b.customerName} · ${formatBDT(p.amount)} · ${p.anomaly ?? formatDateTime(p.createdAt)}`
            )
        );
    }

    const expired = plainAll<Booking>(expiredDocs).map((b) =>
        item(b, "Hold expired", `${b.customerName} · ${b.date} · ${formatDateTime(b.createdAt)}`)
    );
    const refundItems = refunds.map((b) =>
        item(b, "Refund pending", `${b.customerName} · ${formatBDT(received.get(b.id) ?? 0)} to return`)
    );
    const balances = plainAll<Booking>(balanceDocs).map((b) =>
        item(b, "Balance unpaid", `${b.customerName} · ${formatBDT(b.balanceAmount)} · played ${b.date}`)
    );

    const group = (id: AttentionGroup["id"], title: string, hint: string, items: AttentionItem[]): AttentionGroup => ({
        id,
        title,
        hint,
        count: items.length,
        items: items.slice(0, 10),
    });

    return [
        group("payments", "Failed or stuck payments", "Failed, flagged for review, or still processing after 10 minutes.", [...payments.values()]),
        group("refunds", "Refunds pending", "Money received on cancelled or late bookings. Settle and record it.", refundItems),
        group("balances", "Unpaid balances on past bookings", "Slot has ended but the balance was never collected.", balances),
        group("expired", "Expired holds", "Last 7 days. Usually harmless: the customer did not pay in time.", expired),
    ];
}

/* ---------- inquiries ---------- */
export async function listInquiries(user: ServerUser): Promise<InquiryDto[]> {
    assertSuperAdmin(user);
    await connectDb();
    const rows = await InquiryModel.find().sort({ createdAt: -1 }).limit(100).lean<any[]>();
    const sorted = [...rows.filter((r) => r.status === "NEW"), ...rows.filter((r) => r.status !== "NEW")];
    return sorted.slice(0, 50).map(({ id, name, contact, message, status, createdAt }) => ({ id, name, contact, message, status, createdAt }));
}

export async function markInquiryHandled(user: ServerUser, id: string) {
    assertSuperAdmin(user);
    await connectDb();
    const q = await InquiryModel.findOneAndUpdate({ id, status: "NEW" }, { $set: { status: "HANDLED" } }).lean<{ name: string }>();
    if (q) {
        await logAudit(user, { action: "INQUIRY_HANDLED", entityType: "INQUIRY", entityId: id, meta: { from: q.name } });
    } else if (!(await InquiryModel.exists({ id }))) {
        throw new AppError("NOT_FOUND", "Inquiry not found.", 404);
    } // already handled: nothing to do
}

/* ---------- audit log (searchable: scans the latest 1,000 matching entries) ---------- */
export async function getAuditEntries(
    user: ServerUser,
    f: { branch?: string; q?: string; action?: string },
    limit = 100
): Promise<AuditRow[]> {
    assertSuperAdmin(user);
    await connectDb();
    const needle = f.q?.trim().toLowerCase() ?? "";
    const nameOf = new Map(branches.map((b) => [b.id, b.name]));

    const docs = await AuditLogModel.find({
        ...(f.branch ? { branchId: f.branch } : {}),
        ...(f.action ? { action: f.action } : {}),
    })
        .sort({ at: -1 })
        .limit(1000)
        .lean<any[]>();

    return docs
        .filter((a) => {
            if (!needle) return true;
            const hay = [a.action.replace(/_/g, " "), a.actorName, a.entityId, ...Object.values(a.meta ?? {}).map(String)]
                .join(" ")
                .toLowerCase();
            return hay.includes(needle);
        })
        .slice(0, limit)
        .map((a) => ({
            id: a.id,
            action: a.action,
            actorName: a.actorName,
            at: a.at,
            entityType: a.entityType,
            entityId: a.entityId,
            branchName: a.branchId ? (nameOf.get(a.branchId) ?? "") : "",
            meta: a.meta ?? {},
        }));
}