import "server-only";
import { settle } from "@/server/bookings";
import { store } from "@/server/store";
import { settlePayment } from "./settle";

const g = globalThis as unknown as { __ktChecked?: Map<string, number> };

/** Poll helper: when a customer's page says "processing", ask bKash now (at most every 5 s per payment). */
export async function reconcileBooking(code: string, now: Date = new Date()) {
    const b = store.bookings.find((x) => x.bookingCode === code);
    if (!b) return;
    const p = store.payments.find((x) => x.bookingId === b.id && x.provider === "BKASH" && x.status === "PENDING");
    if (!p) return;

    const seen = (g.__ktChecked ??= new Map());
    if (seen.size > 1000) seen.clear();
    if (now.getTime() - (seen.get(p.id) ?? 0) < 5_000) return;
    seen.set(p.id, now.getTime());

    await settlePayment(p.id, "reconcile", now);
}

/** Cron job: settle PENDING bKash payments, expire stale holds, drop expired HELD claims (housekeeping only). */
export async function reconcilePending(now: Date = new Date(), opts: { minAgeMs?: number; limit?: number } = {}) {
    const { minAgeMs = 90_000, limit = 25 } = opts;

    for (const b of store.bookings) settle(b, now);
    store.claims = store.claims.filter(
        (c) => !(c.state === "HELD" && c.expiresAt && new Date(c.expiresAt).getTime() <= now.getTime())
    );

    const due = store.payments
        .filter((p) => p.provider === "BKASH" && p.status === "PENDING" && now.getTime() - Date.parse(p.createdAt) >= minAgeMs)
        .slice(0, limit);

    const summary = { checked: due.length, confirmed: 0, refund: 0, failed: 0, pending: 0 };
    for (const p of due) {
        // One at a time: gentle on bKash, and each result is independent.
        const r = await settlePayment(p.id, "reconcile", now);
        if (r === "CONFIRMED") summary.confirmed++;
        else if (r === "REFUND") summary.refund++;
        else if (r === "FAILED") summary.failed++;
        else summary.pending++;
    }
    return summary;
}