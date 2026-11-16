import type { PriceAdjustment, PricingRule } from "@/types";
import { shared } from "@/lib/shared";

// Regular prices (Admin → Setup → Slots). Empty by default: every price is created in
// Setup and lives in the database. (The database always wins over these defaults.)
export const pricingRules: PricingRule[] = shared<PricingRule[]>("pricingRules", []);
// Date-range price adjustments (Admin → Setup → Slots → Temporary prices). Empty by default.
export const priceAdjustments: PriceAdjustment[] = shared<PriceAdjustment[]>("priceAdjustments", []);
