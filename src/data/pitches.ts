import type { Pitch } from "@/types";
import { shared } from "@/lib/shared";

// Static fallback is intentionally empty.
// All pitches must be created through /admin/setup so they live in the DB.
// shared(): one live copy across route bundles, like branches and pricingRules.
export const pitches: Pitch[] = shared<Pitch[]>("pitches", []);
