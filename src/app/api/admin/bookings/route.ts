import type { NextRequest } from "next/server";
import { bookingSearchSchema, walkInSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { searchBookings } from "@/server/admin/search";
import { createWalkIn } from "@/server/admin/walkin";
import { handleError, ok, readJson } from "@/server/http";

// Search and filter (branch scope enforced inside).
export async function GET(req: NextRequest) {
    try {
        const user = await staffGuard(req, false);
        const q = bookingSearchSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        const bookings = await searchBookings(user, { ...q, limit: q.limit ? Number(q.limit) : undefined });
        return ok({ bookings });
    } catch (e) {
        return handleError(e);
    }
}

// Walk-in booking.
export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        const input = walkInSchema.parse(await readJson(req));
        return ok({ booking: await createWalkIn(user, input) }, 201);
    } catch (e) {
        return handleError(e);
    }
}