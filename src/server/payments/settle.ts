// Server-side verification and settlement of a bKash advance. Idempotent: a duplicate callback,
// a poll and the reconcile job can all call it for the same payment and get one result.
// The "apply" functions have NO awaits, so each is one atomic step (one Mongo transaction in Batch 8).
import "server-only";
import { policies } from "@/data/site";
import { claimCells } from "@/server/admin/claims";
import { logAudit } from "@/server/audit";
import { releaseClaims } from "@/server/bookings";
import { AppError } from "@/server/http";
import { store } from "@/server/store";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/ops";
import { bkashExecute, bkashQuery, type RemotePayment } from "./bkash";

const SYSTEM = { id: "system", name: "System (bKash)" };
const ABANDON_GRACE_MS = 2 * 60_000; // after the hold ends, an unfinished checkout is abandoned

export type Hint = "success" | "failure" | "cancel" | "reconcile";
export type SettleResult = "CONFIRMED" | "REFUND" | "FAILED" | "PENDING" | "NOT_FOUND";

const g = globalThis as unknown as { __ktInflight?: Map<string, Promise<SettleResult>> };
const inflight = (g.__ktInflight ??= new Map());

const bookingOf = (p: Payment) => store.bookings.find((b) => b.id === p.bookingId);

function resultFor(p: Payment): SettleResult {
    if (p.status === "PENDING") return "PENDING";
    if (p.status === "FAILED") return "FAILED";
    return bookingOf(p)?.paymentStatus === "REFUND_PENDING" ? "REFUND" : "CONFIRMED";
}

/** One verification at a time per payment. Concurrent callers share the same result. */
export function settlePayment(paymentId: string, hint: Hint, now: Date = new Date()): Promise<SettleResult> {
    const existing = inflight.get(paymentId);
    if (existing) return existing;
    const run = doSettle(paymentId, hint, now).finally(() => inflight.delete(paymentId));
    inflight.set(paymentId, run);
    return run;
}

async function tryExecute(p: Payment): Promise<RemotePayment | null> {
    try {
        return await bkashExecute(p.providerPaymentId!);
    } catch {
        return null; // outcome unknown: the status query below decides
    }
}

async function doSettle(id: string, hint: Hint, now: Date): Promise<SettleResult> {
    const p = store.payments.find((x) => x.id === id);
    if (!p || p.provider !== "BKASH") return "NOT_FOUND";
    if (p.status !== "PENDING") return resultFor(p); // already settled: return the recorded result

    const age = now.getTime() - Date.parse(p.createdAt);
    const abandonAfter = policies.holdMinutes * 60_000 + ABANDON_GRACE_MS;

    if (!p.providerPaymentId) {
        // The attempt never got a bKash session (crash between our record and their reply).
        return age > abandonAfter ? applyFailed(p, "CREATE_FAILED", now) : "PENDING";
    }

    let remote: RemotePayment;
    try {
        // A "success" redirect is only a hint. Money is confirmed by bKash's own answer below.
        let done = hint === "success" ? await tryExecute(p) : null;
        if (done?.state !== "COMPLETED") {
            const q = await bkashQuery(p.providerPaymentId);
            done = q;
            if (q.state === "OPEN" && q.authorized && hint === "reconcile") {
                const ex = await tryExecute(p);
                if (ex?.state === "COMPLETED") done = ex;
            }
        }
        remote = done;
    } catch {
        return "PENDING"; // bKash unreachable: leave it for the reconcile job
    }

    if (p.status !== "PENDING") return resultFor(p);

    switch (remote.state) {
        case "COMPLETED":
            return applyCompleted(p, remote, now);
        case "FAILED":
            return applyFailed(p, hint === "cancel" ? "CANCELLED" : "FAILED", now);
        case "OPEN":
            if (hint === "failure" || hint === "cancel") return applyFailed(p, hint === "cancel" ? "CANCELLED" : "FAILED", now);
            return age > abandonAfter ? applyFailed(p, "ABANDONED", now) : "PENDING";
        default:
            return "PENDING"; // unknown: stays visible as "stuck" in Insights after 10 minutes
    }
}

function mismatch(p: Payment, r: RemotePayment): string | null {
    if (!r.trxId) return "no transaction ID";
    if (r.amount === undefined || Math.abs(r.amount - p.amount) > 0.001) return "amount differs from the expected advance";
    if (r.currency && r.currency !== "BDT") return "currency is not BDT";
    if (r.invoice && r.invoice !== p.invoice) return "invoice reference differs";
    if (r.paymentId && r.paymentId !== p.providerPaymentId) return "payment ID differs";
    return null;
}

function applyFailed(p: Payment, reason: NonNullable<Payment["failureReason"]>, now: Date): SettleResult {
    p.status = "FAILED";
    p.failureReason = reason;
    const b = bookingOf(p);
    if (b && b.paymentStatus === "PENDING") b.paymentStatus = reason === "CANCELLED" ? "CANCELLED" : "FAILED";

    logAudit(SYSTEM, {
        action: "PAYMENT_FAILED",
        entityType: "BOOKING",
        entityId: b?.bookingCode ?? p.bookingId,
        branchId: b?.branchId ?? null,
        meta: { reason, amount: p.amount, at: now.toISOString() },
    });
    return "FAILED";
}

/** Our held cells if they are all still ours, otherwise a fresh claim. False means the slot is gone. */
function reclaim(b: Booking, now: Date): boolean {
    if (new Date(b.endAt) <= now) return false; // the slot has already been played out

    const mine = store.claims.filter((c) => c.bookingId === b.id);
    if (mine.length === b.cellStarts.length && b.cellStarts.every((s) => mine.some((c) => c.cellStart === s))) {
        // Even if the hold timer ran out, nobody replaced our claims, so they are still safe to keep.
        for (const c of mine) {
            c.state = "BOOKED";
            delete c.expiresAt;
        }
        return true;
    }

    releaseClaims(b.id);
    try {
        claimCells(b.pitchId, b.cellStarts, { state: "BOOKED", bookingId: b.id }, now);
        return true;
    } catch (e) {
        if (e instanceof AppError && e.code === "SLOT_UNAVAILABLE") return false;
        throw e;
    }
}

function applyCompleted(p: Payment, r: RemotePayment, now: Date): SettleResult {
    const b = bookingOf(p);
    const bad = !b ? "booking not found" : mismatch(p, r);
    const dupTxn = !!r.trxId && store.payments.some((x) => x.id !== p.id && x.providerTxnId === r.trxId);

    if (bad || dupTxn || !b) {
        // bKash may have taken money we cannot match. Never confirm, and flag it for a human.
        p.status = "FAILED";
        p.failureReason = "MISMATCH";
        p.anomaly = `Could not verify: ${bad ?? "transaction ID already recorded"}${r.trxId ? ` (trx ${r.trxId})` : ""}. Check the bKash merchant panel.`;
        if (b && b.paymentStatus === "PENDING") b.paymentStatus = "FAILED";
        logAudit(SYSTEM, {
            action: "PAYMENT_ANOMALY",
            entityType: "BOOKING",
            entityId: b?.bookingCode ?? p.bookingId,
            branchId: b?.branchId ?? null,
            meta: { problem: bad ?? "duplicate transaction ID", amount: p.amount },
        });
        return "FAILED";
    }

    // Verified: bKash confirmed amount, currency and reference for the attempt we created.
    p.status = "SUCCESS";
    p.providerTxnId = r.trxId;
    p.verifiedAt = now.toISOString();

    if (b.paymentStatus === "PARTIALLY_PAID" || b.paymentStatus === "PAID") {
        p.anomaly = "A second advance was received for an already-paid booking. Refund it.";
        logAudit(SYSTEM, {
            action: "PAYMENT_ANOMALY",
            entityType: "BOOKING",
            entityId: b.bookingCode,
            branchId: b.branchId,
            meta: { problem: "duplicate advance", amount: p.amount, trx: r.trxId ?? null },
        });
        return "CONFIRMED";
    }

    const revivable = b.bookingStatus === "PENDING_PAYMENT" || b.bookingStatus === "EXPIRED";
    if (revivable && reclaim(b, now)) {
        b.bookingStatus = "CONFIRMED";
        b.paymentStatus = "PARTIALLY_PAID";
        logAudit(SYSTEM, {
            action: "PAYMENT_VERIFIED",
            entityType: "BOOKING",
            entityId: b.bookingCode,
            branchId: b.branchId,
            meta: { amount: p.amount, trx: r.trxId ?? null, provider: "BKASH" },
        });
        return "CONFIRMED";
    }

    // Late success and the slot is gone (or the booking was cancelled). Never silently keep the money.
    b.paymentStatus = "REFUND_PENDING";
    if (b.bookingStatus === "PENDING_PAYMENT") b.bookingStatus = "EXPIRED";
    logAudit(SYSTEM, {
        action: "LATE_PAYMENT_REFUND",
        entityType: "BOOKING",
        entityId: b.bookingCode,
        branchId: b.branchId,
        meta: { amount: p.amount, trx: r.trxId ?? null, reason: "Paid after the slot was released" },
    });
    return "REFUND";
}