// Sign-up step 1: validate the details and email a 6-digit code (see server/auth/emailOtp).
import type { NextRequest } from "next/server";
import { registerDetailsSchema } from "@/schemas/auth";
import { startRegistration } from "@/server/auth/users";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { sharedRateLimit } from "@/server/security/sharedRateLimit";

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        // Cheap first line per instance; the real per-email and per-IP limits are in MongoDB.
        if (
            !(await rateLimitAsync(`reg-code:${clientIp(req)}`, 10, 10 * 60_000)) ||
            !(await sharedRateLimit(`reg-code:${clientIp(req)}`, 10, 10 * 60_000))
        ) {
            throw new AppError("RATE_LIMITED", "Too many requests. Please wait a few minutes.", 429);
        }
        const body = await readJson(req);
        const input = registerDetailsSchema.parse(body);
        // Only the "Resend code" button asks for a NEW code; a plain submit reuses a live one.
        const resend = !!body && typeof body === "object" && (body as { resend?: unknown }).resend === true;
        return ok(await startRegistration(input, { ip: clientIp(req), resend }));
    } catch (e) {
        return handleError(e);
    }
}
