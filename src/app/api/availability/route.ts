import type { NextRequest } from "next/server";
import { venue } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays } from "@/lib/time";
import { availabilityQuerySchema } from "@/schemas/booking";
import { findNextAvailableDate, getBranchPitches, getPitchAvailability } from "@/server/availability";
import { AppError, clientIp, handleError, ok } from "@/server/http";
import { rateLimit } from "@/server/security/rateLimit";
import type { AvailabilityResponse } from "@/types/booking";
import { todayDhaka } from "@/lib/time.server";
import { connectDb } from "@/server/db/connect";

export async function GET(req: NextRequest) {
    try {
        if (!rateLimit(`avail:${clientIp(req)}`, 120, 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
        }

        const sp = req.nextUrl.searchParams;
        const q = availabilityQuerySchema.parse({
            branch: sp.get("branch") ?? venue.id,
            sport: sp.get("sport"),
            date: sp.get("date"),
        });

        if (!venue || venue.status !== "ACTIVE") {
            throw new AppError("VENUE_DISABLED", "Online bookings are not available right now.", 409);
        }
        if (!venue.sports.includes(q.sport)) {
            throw new AppError("VALIDATION", "That sport is not available.", 400);
        }

        await connectDb();

        const now = new Date();
        const today = await todayDhaka(now);
        const last = addDays(today, policies.bookingHorizonDays);

        if (q.date < today || q.date > last) {
            throw new AppError("OUT_OF_RANGE", "Choose a date inside the booking window.", 400);
        }

        const branchPitches = getBranchPitches(venue.id, q.sport);

        const pitches = await Promise.all(
            branchPitches.map(async (p) => ({
                id: p.id,
                name: p.name,
                sport: p.sport,
                format: p.format,
                maxConsecutiveSlots: p.maxConsecutiveSlots,
                cells: await getPitchAvailability(p.id, q.date, now),
            }))
        );

        const hasOpen = pitches.some((p) => p.cells.some((c) => c.status === "AVAILABLE"));

        const body: AvailabilityResponse = {
            venueId: venue.id,
            sport: q.sport,
            date: q.date,
            updatedAt: now.toISOString(),
            pitches,
            nextAvailableDate: hasOpen
                ? null
                : await findNextAvailableDate(venue.id, q.sport, q.date, last, now),
        };

        return ok(body);
    } catch (e) {
        return handleError(e);
    }
}