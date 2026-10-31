
import "server-only";

import { SlotClaimModel } from "@/models";
import { AppError } from "@/server/http";
import { connectDb } from "@/server/db/connect";
import type { SlotClaim } from "@/types";

/**
 * Staff-side claim insert (walk-ins, maintenance).
 *
 * 1. Remove expired HELD claims for the requested cells.
 * 2. Check whether any requested cell is already claimed.
 * 3. Insert all claims atomically.
 */
export async function claimCells(
    pitchId: string,
    starts: string[],
    claim: Pick<SlotClaim, "state" | "bookingId" | "reason">,
    now: Date
): Promise<void> {
    if (starts.length === 0) return;

    await connectDb();

    const session = await SlotClaimModel.db.startSession();
    const nowIso = now.toISOString();

    try {
        await session.withTransaction(async () => {
            // Remove expired HELD claims for the requested cells.
            await SlotClaimModel.deleteMany(
                {
                    pitchId,
                    cellStart: { $in: starts },
                    state: "HELD",
                    expiresAt: { $lte: nowIso },
                },
                { session }
            );

            // Any remaining claim makes the requested cells unavailable.
            const existingClaim = await SlotClaimModel.findOne({
                pitchId,
                cellStart: { $in: starts },
            })
                .session(session)
                .lean();

            if (existingClaim) {
                throw new AppError(
                    "SLOT_UNAVAILABLE",
                    "That slot was just taken. Refresh the board.",
                    409
                );
            }

            // Insert all requested claims in the same transaction.
            await SlotClaimModel.insertMany(
                starts.map((cellStart) => ({
                    pitchId,
                    cellStart,
                    ...claim,
                })),
                {
                    session,
                    ordered: true,
                }
            );
        });
    } catch (error) {
        // A unique-index collision can occur when concurrent requests
        // attempt to claim the same pitch and cell.
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === 11000
        ) {
            throw new AppError(
                "SLOT_UNAVAILABLE",
                "That slot was just taken. Refresh the board.",
                409
            );
        }

        throw error;
    } finally {
        await session.endSession();
    }
}
