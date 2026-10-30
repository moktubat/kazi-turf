// Staff-side claim insert (walk-ins, maintenance). Mirrors the Mongo transaction in spec 8.3:
// drop expired HELD claims for the target cells, then insert. Any existing claim = unavailable.
import "server-only";
import { AppError } from "@/server/http";
import { store } from "@/server/store";
import type { SlotClaim } from "@/types";

export function claimCells(
    pitchId: string,
    starts: string[],
    claim: Pick<SlotClaim, "state" | "bookingId" | "reason">,
    now: Date
) {
    store.claims = store.claims.filter(
        (c) =>
            !(
                c.pitchId === pitchId &&
                starts.includes(c.cellStart) &&
                c.state === "HELD" &&
                c.expiresAt &&
                new Date(c.expiresAt) <= now
            )
    );

    if (store.claims.some((c) => c.pitchId === pitchId && starts.includes(c.cellStart))) {
        throw new AppError("SLOT_UNAVAILABLE", "That slot was just taken. Refresh the board.", 409);
    }
    for (const cellStart of starts) store.claims.push({ pitchId, cellStart, ...claim });
}