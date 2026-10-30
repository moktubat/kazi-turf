// Slot claims (spec §8.3). The unique { pitchId, cellStart } index guarantees two claims can never
// exist for the same cell. Every function takes the caller's transaction session.
import "server-only";
import type { ClientSession } from "mongoose";
import { SlotClaimModel } from "@/models";
import { connectDb, tx } from "@/server/db/connect";
import { isDup } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { SlotClaim } from "@/types";

type Init = Pick<SlotClaim, "state" | "bookingId" | "reason" | "expiresAt">;

const taken = () =>
    new AppError("SLOT_UNAVAILABLE", "Someone just took that slot. Pick another time.", 409);

/**
 * Acquire: delete expired HELD claims for the target cells, then insert all.
 * A duplicate-key error means the slot was taken. Throwing aborts the surrounding transaction,
 * so a multi-slot booking never leaves partial claims behind.
 */
export async function insertClaims(
    pitchId: string,
    starts: string[],
    init: Init,
    now: Date,
    session: ClientSession
) {
    await SlotClaimModel.deleteMany(
        { pitchId, cellStart: { $in: starts }, state: "HELD", expiresAt: { $lte: now.toISOString() } },
        { session }
    );
    try {
        await SlotClaimModel.insertMany(
            starts.map((cellStart) => ({ pitchId, cellStart, ...init })),
            { session, ordered: true }
        );
    } catch (e) {
        if (isDup(e)) throw taken();
        throw e;
    }
}

/** Staff-side claim (walk-ins, maintenance) in its own transaction. */
export async function claimCells(pitchId: string, starts: string[], init: Init, now: Date = new Date()) {
    await tx((s) => insertClaims(pitchId, starts, init, now, s));
}

/** Release: failed payment, cancellation or expiry deletes the claims. */
export async function releaseClaims(bookingIds: string | string[], session?: ClientSession) {
    await connectDb();
    const ids = Array.isArray(bookingIds) ? bookingIds : [bookingIds];
    if (ids.length === 0) return;
    await SlotClaimModel.deleteMany({ bookingId: { $in: ids } }, { session });
}

/**
 * Confirm (after a verified advance): HELD -> BOOKED, clear expiresAt.
 * Cells that are still ours are kept even if the hold timer ran out. Cells that were released
 * are re-claimed if free. If another booking now owns any of them, throws SLOT_UNAVAILABLE.
 */
export async function confirmClaims(
    b: { id: string; pitchId: string; endAt: string; cellStarts: string[] },
    now: Date,
    session: ClientSession
) {
    if (new Date(b.endAt) <= now) throw taken(); // the slot has already been played out

    const mine = await SlotClaimModel.find({ bookingId: b.id }).session(session).lean();
    const have = new Set(mine.map((c: any) => c.cellStart));
    const missing = b.cellStarts.filter((s) => !have.has(s));

    if (missing.length > 0) {
        await SlotClaimModel.deleteMany(
            { pitchId: b.pitchId, cellStart: { $in: missing }, state: "HELD", expiresAt: { $lte: now.toISOString() } },
            { session }
        );
        const blocking = await SlotClaimModel.countDocuments({
            pitchId: b.pitchId,
            cellStart: { $in: missing },
        }).session(session);
        if (blocking > 0) throw taken();
        try {
            await SlotClaimModel.insertMany(
                missing.map((cellStart) => ({ pitchId: b.pitchId, cellStart, state: "BOOKED", bookingId: b.id })),
                { session }
            );
        } catch (e) {
            if (isDup(e)) throw taken(); // lost a race: the unique index decides
            throw e;
        }
    }

    await SlotClaimModel.updateMany(
        { bookingId: b.id },
        { $set: { state: "BOOKED" }, $unset: { expiresAt: "" } },
        { session }
    );
}