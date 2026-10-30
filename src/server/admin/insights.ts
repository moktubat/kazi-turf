// Insights aggregates, "Needs attention", inquiry inbox and audit search. Super Admin only.
import "server-only";
import { branches } from "@/data/branches";
import { pitches } from "@/data/pitches";
import { policies } from "@/data/site";
import { formatBDT } from "@/lib/format";
import { formatDateShort } from "@/lib/format";
import { formatDateTime } from "@/lib/formatAdmin";
import { addDays, dhakaParts, dhakaToUtc, toHHMM, toMinutes } from "@/lib/time";
import { logAudit } from "@/server/audit";
import type { ServerUser } from "@/server/auth/session";
import { settle } from "@/server/bookings";
import { AppError } from "@/server/http";
import { store } from "@/server/store";
import type { Booking } from "@/types/booking";
import type { AttentionGroup, AttentionItem, AuditRow, InquiryDto, InsightsData } from "@/types/insights";
import { assertSuperAdmin } from "./access";

const COUNTED = new Set(["CONFIRMED", "CHECKED_IN", "COMPLETED"]);
export const MAX_RANGE_DAYS = 92;
const DAY_MS = 86_400_000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dowOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const spanDays = (from: string, to: string) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

export function getInsights(
    user: ServerUser,
    f: { from: string; to: string; branch?: string },
    now: Date = new Date()
): InsightsData {
    assertSuperAdmin(user);
    const span = spanDays(f.from, f.to);
    if (span < 1 || span > MAX_RANGE_DAYS) {
        throw new AppError("OUT_OF_RANGE", `Choose a range of up to ${MAX_RANGE_DAYS} days.`, 400);
    }
    if (f.branch && !branches.some((b) => b.id === f.branch)) throw new AppError("NOT_FOUND", "Branch not found.", 404);

    for (const b of store.bookings) settle(b, now);

    const scope = branches.filter((b) => b.status !== "COMING_SOON" && (!f.branch || b.id === f.branch));
    const scopeIds = new Set(scope.map((b) => b.id));
    const inScope = store.bookings.filter((b) => scopeIds.has(b.branchId));
    const byId = new Map(inScope.map((b) => [b.id, b]));
    const counted = inScope.filter((b) => COUNTED.has(b.bookingStatus));
    const inRange = counted.filter((b) => b.date >= f.from && b.date <= f.to);

    // Collected = money actually received, by payment date. Fully refunded bookings are excluded.
    const paid = store.payments.flatMap((p) => {
        if (p.status !== "SUCCESS") return [];
        const b = byId.get(p.bookingId);
        if (!b || b.paymentStatus === "REFUNDED") return [];
        const date = dhakaParts(new Date(p.verifiedAt ?? p.createdAt)).date;
        return date >= f.from && date <= f.to ? [{ p, b, date }] : [];
    });
    const collected = paid.reduce((s, x) => s + x.p.amount, 0);

    // Pending is never counted as collected.
    const pending = store.payments.filter((p) => p.status === "PENDING" && byId.has(p.bookingId));
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
    for (const b of counted) for (const cs of b.cellStarts) bookedSet.add(`${b.pitchId}|${cs}`);
    const maint = new Set(store.claims.filter((c) => c.state === "MAINTENANCE").map((c) => `${c.pitchId}|${c.cellStart}`));

    const total = new Map<string, number>();
    const booked = new Map<string, number>();
    const times = new Set<number>();
    let totalCells = 0;
    let bookedCells = 0;

    for (const p of pitches) {
        if (p.status !== "ACTIVE" || !scopeIds.has(p.branchId)) continue;
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
    for (const b of inRange) source[b.source].bookings++;
    for (const { p, b } of paid) source[b.source].collected += p.amount;

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
export function getAttention(user: ServerUser, branch?: string, now: Date = new Date()): AttentionGroup[] {
    assertSuperAdmin(user);
    for (const b of store.bookings) settle(b, now);

    const scope = store.bookings.filter((b) => !branch || b.branchId === branch);
    const byId = new Map(scope.map((b) => [b.id, b]));
    const received = (b: Booking) =>
        store.payments.filter((p) => p.bookingId === b.id && p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);
    const item = (b: Booking, title: string, detail: string): AttentionItem => ({ code: b.bookingCode, title, detail });

    const payments = new Map<string, AttentionItem>();
    for (const p of store.payments) {
        const b = byId.get(p.bookingId);
        if (!b) continue;
        const failed = p.status === "FAILED";
        const stuck = p.status === "PENDING" && now.getTime() - new Date(p.createdAt).getTime() > 10 * 60_000;
        if (!failed && !stuck) continue;
        payments.set(
            b.bookingCode,
            item(b, failed ? "Payment failed" : "Payment stuck in processing", `${b.customerName} · ${formatBDT(p.amount)} · ${formatDateTime(p.createdAt)}`)
        );
    }

    const recent = (b: Booking) => now.getTime() - new Date(b.createdAt).getTime() <= 7 * DAY_MS;
    const expired = scope
        .filter((b) => b.bookingStatus === "EXPIRED" && recent(b))
        .map((b) => item(b, "Hold expired", `${b.customerName} · ${b.date} · ${formatDateTime(b.createdAt)}`));

    const refunds = scope
        .filter((b) => b.paymentStatus === "REFUND_PENDING")
        .map((b) => item(b, "Refund pending", `${b.customerName} · ${formatBDT(received(b))} to return`));

    const balances = scope
        .filter((b) => COUNTED.has(b.bookingStatus) && b.paymentStatus === "PARTIALLY_PAID" && new Date(b.endAt) < now)
        .map((b) => item(b, "Balance unpaid", `${b.customerName} · ${formatBDT(b.balanceAmount)} · played ${b.date}`));

    const group = (id: AttentionGroup["id"], title: string, hint: string, items: AttentionItem[]): AttentionGroup => ({
        id,
        title,
        hint,
        count: items.length,
        items: items.slice(0, 10),
    });

    return [
        group("payments", "Failed or stuck payments", "Failed, or still processing after 10 minutes.", [...payments.values()]),
        group("refunds", "Refunds pending", "Money received on cancelled or late bookings. Settle and record it.", refunds),
        group("balances", "Unpaid balances on past bookings", "Slot has ended but the balance was never collected.", balances),
        group("expired", "Expired holds", "Last 7 days. Usually harmless: the customer did not pay in time.", expired),
    ];
}

/* ---------- inquiries ---------- */
export function listInquiries(user: ServerUser): InquiryDto[] {
    assertSuperAdmin(user);
    return [...store.inquiries]
        .sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "NEW" ? -1 : 1))
        .slice(0, 50)
        .map(({ id, name, contact, message, status, createdAt }) => ({ id, name, contact, message, status, createdAt }));
}

export function markInquiryHandled(user: ServerUser, id: string) {
    assertSuperAdmin(user);
    const q = store.inquiries.find((x) => x.id === id);
    if (!q) throw new AppError("NOT_FOUND", "Inquiry not found.", 404);
    if (q.status === "HANDLED") return;
    q.status = "HANDLED";
    logAudit(user, { action: "INQUIRY_HANDLED", entityType: "INQUIRY", entityId: q.id, meta: { from: q.name } });
}

/* ---------- audit log (searchable) ---------- */
export function getAuditEntries(
    user: ServerUser,
    f: { branch?: string; q?: string; action?: string },
    limit = 100
): AuditRow[] {
    assertSuperAdmin(user);
    const needle = f.q?.trim().toLowerCase() ?? "";
    const nameOf = new Map(branches.map((b) => [b.id, b.name]));

    return store.auditLogs
        .filter((a) => {
            if (f.branch && a.branchId !== f.branch) return false;
            if (f.action && a.action !== f.action) return false;
            if (!needle) return true;
            const hay = [a.action.replace(/_/g, " "), a.actorName, a.entityId, ...Object.values(a.meta).map(String)]
                .join(" ")
                .toLowerCase();
            return hay.includes(needle);
        })
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit)
        .map((a) => ({
            id: a.id,
            action: a.action,
            actorName: a.actorName,
            at: a.at,
            entityType: a.entityType,
            entityId: a.entityId,
            branchName: a.branchId ? (nameOf.get(a.branchId) ?? "") : "",
            meta: a.meta,
        }));
}