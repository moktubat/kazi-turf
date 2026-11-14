import type { NextRequest } from "next/server";
import { venue } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays } from "@/lib/time";
import { availabilityQuerySchema } from "@/schemas/booking";
import { findNextAvailableDate, getBranchAvailability } from "@/server/availability";
import { AppError, clientIp, handleError, ok } from "@/server/http";
import { rateLimitAsync } from "@/server/security/rateLimit";
import type { AvailabilityResponse } from "@/types/booking";
import { todayDhaka } from "@/lib/time.server";
import { connectDb } from "@/server/db/connect";

export async function GET(req: NextRequest) {
    try {
        // Reduced from 120/min to 30/min — availability data is cacheable for 30s.
        if (!(await rateLimitAsync(`avail:${clientIp(req)}`, 30, 60_000))) {
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

        // SINGLE batched Mongo query for all pitches of this branch+sport.
        const pitchData = await getBranchAvailability(venue.id, q.sport, q.date, now);

        const pitches = pitchData.map(({ pitch, cells }) => ({
            id: pitch.id,
            name: pitch.name,
            sport: pitch.sport,
            format: pitch.format,
            maxConsecutiveSlots: pitch.maxConsecutiveSlots,
            cells,
        }));

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

        // Cache the public availability response at the edge for 30 seconds.
        const res = ok(body);
        res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
        return res;
    } catch (e) {
        return handleError(e);
    }
}