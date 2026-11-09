import type { Pitch } from "@/types";

// Static fallback is intentionally empty.
// All pitches must be created through /admin/setup so they live in the DB.
export const pitches: Pitch[] = [];