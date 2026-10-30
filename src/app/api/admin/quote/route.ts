import type { NextRequest } from "next/server";
import { walkInQuoteSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { quoteWalkIn } from "@/server/admin/walkin";
import { handleError, ok, readJson } from "@/server/http";

// Server-calculated walk-in price. Staff never type a price.
export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        const input = walkInQuoteSchema.parse(await readJson(req));
        return ok({ quote: await quoteWalkIn(user, input.pitchId, input.cellStarts) });
    } catch (e) {
        return handleError(e);
    }
}