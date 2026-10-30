// Server-side verification and settlement of a bKash advance. Idempotent: a duplicate callback,
// a poll and the reconcile job can all call it for the same payment and get one result.
// The payment document's "still PENDING" condition makes this safe across serverless instances.
import "server-only";
import { policies } from "@/data/site";
import { BookingModel, PaymentModel } from "@/models";
import { logAudit } from "@/server/audit";
import { findBookingById } from "@/server/bookings";
import { confirmClaims, releaseClaims } from "@/server/claims";
import { connectDb, tx } from "@/server/db/connect";
import { plain } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { Payment } from "@/types/ops";
import { bkashExecute, bkashQuery, type RemotePayment } from "./bkash";

const SYSTEM = { id: "system", name: "System (bKash)" };
const ABANDON_GRACE_MS = 2 * 60_000; // after the hold ends, an unfinished checkout is abandoned

export type Hint = "success" | "failure" | "cancel" | "reconcile";
export type SettleResult = "CONFIRMED" | "REFUND" | "FAILED" | "PENDING" | "NOT_FOUND";

const g = globalThis as unknown as { __ktInflight?: Map<string, Promise<SettleResult>> };
const inflight = (g.__ktInflight ??= new Map());

async function getPayment(id: string): Promise<Payment | null> {
    const d = await PaymentModel.findOne({ id }).lean();
    return d ? plain<Payment>(d) : null;
}

async function resultFor(p: Payment): Promise<SettleResult> {
    if (p.status === "PENDING") return "PENDING";
    if (p.status === "FAILED") return "FAILED";
    const b = await findBookingById(p.bookingId);
    return b?.paymentStatus === "REFUND_PENDING" ? "REFUND" : "CONFIRMED";
}

async function after(id: string): Promise<SettleResult> {
    const fresh = await getPayment(id);
    return fresh ? resultFor(fresh) : "NOT_FOUND";
}

/** One verification at a time per payment per process. Concurrent callers share the same result. */
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
    await connectDb();
    const p = await getPayment(id);
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

    const fresh = await getPayment(id);
    if (!fresh || fresh.status !== "PENDING") return fresh ? resultFor(fresh) : "NOT_FOUND";

    switch (remote.state) {
        case "COMPLETED":
            return applyCompleted(fresh, remote, now);
        case "FAILED":
            return applyFailed(fresh, hint === "cancel" ? "CANCELLED" : "FAILED", now);
        case "OPEN":
            if (hint === "failure" || hint === "cancel") return applyFailed(fresh, hint === "cancel" ? "CANCELLED" : "FAILED", now);
            return age > abandonAfter ? applyFailed(fresh, "ABANDONED", now) : "PENDING";
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

async function applyFailed(
    p: Payment,
    reason: NonNullable<Payment["failureReason"]>,
    now: Date
): Promise<SettleResult> {
    const b = await findBookingById(p.bookingId);
    await tx(async (s) => {
        const r = await PaymentModel.updateOne(
            { id: p.id, status: "PENDING" },
            { $set: { status: "FAILED", failureReason: reason } },
            { session: s }
        );
        if (r.modifiedCount === 0) return; // someone else settled it first
        await BookingModel.updateOne(
            { id: p.bookingId, paymentStatus: "PENDING" },
            { $set: { paymentStatus: reason === "CANCELLED" ? "CANCELLED" : "FAILED" } },
            { session: s }
        );
        await logAudit(
            SYSTEM,
            {
                action: "PAYMENT_FAILED",
                entityType: "BOOKING",
                entityId: b?.bookingCode ?? p.bookingId,
                branchId: b?.branchId ?? null,
                meta: { reason, amount: p.amount, at: now.toISOString() },
            },
            { session: s }
        );
    });
    return after(p.id);
}

async function applyCompleted(p: Payment, r: RemotePayment, now: Date): Promise<SettleResult> {
    const b = await findBookingById(p.bookingId);
    const bad = !b ? "booking not found" : mismatch(p, r);
    const dup = !!r.trxId && !!(await PaymentModel.exists({ id: { $ne: p.id }, providerTxnId: r.trxId }));

    if (!b || bad || dup) {
        // bKash may have taken money we cannot match. Never confirm, and flag it for a human.
        await tx(async (s) => {
            const note = `Could not verify: ${bad ?? "transaction ID already recorded"}${r.trxId ? ` (trx ${r.trxId})` : ""}. Check the bKash merchant panel.`;
            const u = await PaymentModel.updateOne(
                { id: p.id, status: "PENDING" },
                { $set: { status: "FAILED", failureReason: "MISMATCH", anomaly: note } },
                { session: s }
            );
            if (u.modifiedCount === 0) return;
            if (b) await BookingModel.updateOne({ id: b.id, paymentStatus: "PENDING" }, { $set: { paymentStatus: "FAILED" } }, { session: s });
            await logAudit(
                SYSTEM,
                {
                    action: "PAYMENT_ANOMALY",
                    entityType: "BOOKING",
                    entityId: b?.bookingCode ?? p.bookingId,
                    branchId: b?.branchId ?? null,
                    meta: { problem: bad ?? "duplicate transaction ID", amount: p.amount },
                },
                { session: s }
            );
        });
        return after(p.id);
    }

    const verified = { status: "SUCCESS", providerTxnId: r.trxId, verifiedAt: now.toISOString() };

    try {
        // Verified: bKash confirmed amount, currency and reference for the attempt we created.
        await tx(async (s) => {
            const claimed = await PaymentModel.findOneAndUpdate(
                { id: p.id, status: "PENDING" },
                { $set: verified },
                { session: s }
            ).lean();
            if (!claimed) return; // someone else settled it first

            const cur = plain<typeof b>(await BookingModel.findOne({ id: b.id }).session(s).lean());

            if (cur.paymentStatus === "PARTIALLY_PAID" || cur.paymentStatus === "PAID") {
                await PaymentModel.updateOne(
                    { id: p.id },
                    { $set: { anomaly: "A second advance was received for an already-paid booking. Refund it." } },
                    { session: s }
                );
                await logAudit(
                    SYSTEM,
                    {
                        action: "PAYMENT_ANOMALY",
                        entityType: "BOOKING",
                        entityId: cur.bookingCode,
                        branchId: cur.branchId,
                        meta: { problem: "duplicate advance", amount: p.amount, trx: r.trxId ?? null },
                    },
                    { session: s }
                );
                return;
            }

            const revivable = cur.bookingStatus === "PENDING_PAYMENT" || cur.bookingStatus === "EXPIRED";
            if (!revivable) throw new AppError("SLOT_UNAVAILABLE", "Booking is no longer open.", 409);

            await confirmClaims(cur, now, s); // throws SLOT_UNAVAILABLE if another booking owns a cell
            await BookingModel.updateOne(
                { id: b.id },
                { $set: { bookingStatus: "CONFIRMED", paymentStatus: "PARTIALLY_PAID" } },
                { session: s }
            );
            await logAudit(
                SYSTEM,
                {
                    action: "PAYMENT_VERIFIED",
                    entityType: "BOOKING",
                    entityId: cur.bookingCode,
                    branchId: cur.branchId,
                    meta: { amount: p.amount, trx: r.trxId ?? null, provider: "BKASH" },
                },
                { session: s }
            );
        });
    } catch (e) {
        if (!(e instanceof AppError) || e.code !== "SLOT_UNAVAILABLE") throw e;

        // Late success and the slot is gone (or the booking was cancelled). The transaction above rolled
        // back, so record the money and flag the refund in a second one. Never silently keep the money.
        await tx(async (s) => {
            const claimed = await PaymentModel.findOneAndUpdate(
                { id: p.id, status: "PENDING" },
                { $set: verified },
                { session: s }
            ).lean();
            if (!claimed) return;
            await releaseClaims(b.id, s); // free any cell of ours that is still held
            await BookingModel.updateOne({ id: b.id }, { $set: { paymentStatus: "REFUND_PENDING" } }, { session: s });
            await BookingModel.updateOne(
                { id: b.id, bookingStatus: "PENDING_PAYMENT" },
                { $set: { bookingStatus: "EXPIRED" } },
                { session: s }
            );
            await logAudit(
                SYSTEM,
                {
                    action: "LATE_PAYMENT_REFUND",
                    entityType: "BOOKING",
                    entityId: b.bookingCode,
                    branchId: b.branchId,
                    meta: { amount: p.amount, trx: r.trxId ?? null, reason: "Paid after the slot was released" },
                },
                { session: s }
            );
        });
    }
    return after(p.id);
}