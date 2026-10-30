// Temporary in-memory data layer. Replaced by Mongoose models (Batch 6).
// globalThis keeps one copy across route bundles and dev hot reloads.
import "server-only";
import { claims as seedClaims } from "@/data/claims";
import type { SlotClaim } from "@/types";
import type { Booking, Inquiry } from "@/types/booking";

interface Store {
    claims: SlotClaim[];
    bookings: Booking[];
    inquiries: Inquiry[];
}

const g = globalThis as unknown as { __ktStore?: Store };

export const store: Store = (g.__ktStore ??= {
    claims: seedClaims.map((c) => ({ ...c })),
    bookings: [],
    inquiries: [],
});