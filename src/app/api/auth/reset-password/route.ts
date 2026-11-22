import type { NextRequest } from "next/server";
import { z } from "zod";
import { RESET_COOKIE, consumePasswordReset, resetCookieOptions } from "@/server/auth/resetToken";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { sharedRateLimit } from "@/server/security/sharedRateLimit";
import { assertSameOrigin } from "@/server/security/origin";
import { customerPasswordSchema } from "@/schemas/password";

const schema = z.object({
    token: z.string().min(20).max(100),
    newPassword: customerPasswordSchema,
});

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        // Tokens are 256-bit random, so this is about load, not guessing.
        if (!(await sharedRateLimit(`reset:${clientIp(req)}`, 20, 15 * 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes.", 429);
        }
        const { token, newPassword } = schema.parse(await readJson(req));
        await consumePasswordReset(token, newPassword);
        const res = ok({ reset: true });
        res.cookies.set(RESET_COOKIE, "", resetCookieOptions(0));
        return res;
    } catch (e) {
        return handleError(e);
    }
}