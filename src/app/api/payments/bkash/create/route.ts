import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/guards";
import { AppError, handleError, ok, readJson } from "@/server/http";
import { startBkashPayment } from "@/server/payments/start";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";

const schema = z.object({ code: z.string().regex(/^KT-[A-HJ-NP-Z2-9]{6}$/) });

// The browser sends only the booking code. The amount is whatever the server saved on the booking.
export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await requireUser();
        if (user.role === "STAFF") throw new AppError("FORBIDDEN", "Staff accounts book through the Staff Desk.", 403);
        if (!(await rateLimitAsync(`pay:${user.id}`, 6, 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment.", 429);
        }
        const { code } = schema.parse(await readJson(req));
        return ok(await startBkashPayment(user, code));
    } catch (e) {
        return handleError(e);
    }
}