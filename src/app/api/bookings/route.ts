import type { NextRequest } from "next/server";
import { createBookingSchema } from "@/schemas/booking";
import { getSessionUser } from "@/server/auth/session";
import { createBooking } from "@/server/bookings";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { assertSameOrigin } from "@/server/security/origin";
import { connectDb } from "@/server/db/connect";
import { BookingModel } from "@/models";

// Creates the slot hold and the pending booking.
export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await getSessionUser();
        if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
        if (user.role === "STAFF") {
            throw new AppError("FORBIDDEN", "Staff accounts book through the Staff Desk.", 403);
        }
        if (!(await rateLimitAsync(`hold:${user.id}`, 10, 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment.", 429);
        }

        // IP-based holds cap: at most 20 holds/hour from one IP, regardless of account.
        // Prevents slot-locking abuse via multiple accounts from one source.
        const ip = clientIp(req);
        const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
        await connectDb();
        const recentHoldsFromIp = await BookingModel.countDocuments({
            source: "online",
            createdFromIp: ip,
            createdAt: { $gte: hourAgo },
        });
        if (recentHoldsFromIp >= 20) {
            throw new AppError("RATE_LIMITED", "Too many booking attempts from this connection. Please try again later.", 429);
        }

        // NOTE: To make this cap effective, the booking record must store `createdFromIp`.
        // See FIX-16B below for the schema change.

        const input = createBookingSchema.parse(await readJson(req));
        const booking = await createBooking(user, input, { ip });
        return ok({ booking }, 201);
    } catch (e) {
        return handleError(e);
    }
}
