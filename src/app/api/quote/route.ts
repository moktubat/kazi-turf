import type { NextRequest } from "next/server";
import { quoteSchema } from "@/schemas/booking";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { quoteSelection } from "@/server/bookings";
import { rateLimit } from "@/server/security/rateLimit";

export async function POST(req: NextRequest) {
    try {
        if (!rateLimit(`quote:${clientIp(req)}`, 90, 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
        }
        const input = quoteSchema.parse(await readJson(req));
        return ok({ quote: quoteSelection(input.pitchId, input.cellStarts) });
    } catch (e) {
        return handleError(e);
    }
}