import type { NextRequest } from "next/server";
import { branches } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays, todayDhaka } from "@/lib/time";
import { availabilityQuerySchema } from "@/schemas/booking";
import { findNextAvailableDate, getBranchPitches, getPitchAvailability } from "@/server/availability";
import { AppError, clientIp, handleError, ok } from "@/server/http";
import { rateLimit } from "@/server/security/rateLimit";
import type { AvailabilityResponse } from "@/types/booking";

export async function GET(req: NextRequest) {
    try {
        if (!rateLimit(`avail:${clientIp(req)}`, 120, 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
        }

        const sp = req.nextUrl.searchParams;
        const q = availabilityQuerySchema.parse({
            branch: sp.get("branch"),
            sport: sp.get("sport"),
            date: sp.get("date"),
        });

        const branch = branches.find((b) => b.id === q.branch);
        if (!branch || branch.status !== "ACTIVE") {
            throw new AppError("BRANCH_DISABLED", "This branch is not taking bookings right now.", 409);
        }
        if (!branch.sports.includes(q.sport)) {
            throw new AppError("VALIDATION", "That sport is not offered at this branch.", 400);
        }

        const now = new Date();
        const today = todayDhaka(now);
        const last = addDays(today, policies.bookingHorizonDays);
        if (q.date < today || q.date > last) {
            throw new AppError("OUT_OF_RANGE", "Choose a date inside the booking window.", 400);
        }

        const pitches = await Promise.all(
            getBranchPitches(branch.id, q.sport).map(async (p) => ({
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
            branchId: branch.id,
            sport: q.sport,
            date: q.date,
            updatedAt: now.toISOString(),
            pitches,
            nextAvailableDate: hasOpen ? null : await findNextAvailableDate(branch.id, q.sport, q.date, last, now),
        };
        return ok(body);
    } catch (e) {
        return handleError(e);
    }
}