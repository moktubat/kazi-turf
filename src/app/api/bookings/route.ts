import type { NextRequest } from "next/server";
import { createBookingSchema } from "@/schemas/booking";
import { getSessionUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { AppError, handleError, ok, readJson } from "@/server/http";
import { rateLimit } from "@/server/security/rateLimit";

// Creates the slot hold and the pending booking.
export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
        if (user.role === "STAFF") {
            throw new AppError("FORBIDDEN", "Staff accounts book through the Staff Desk.", 403);
        }
        if (!rateLimit(`hold:${user.id}`, 10, 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment.", 429);
        }

        const input = createBookingSchema.parse(await readJson(req));
        const booking = createBooking(user, input);
        return ok({ booking }, 201);
    } catch (e) {
        return handleError(e);
    }
}