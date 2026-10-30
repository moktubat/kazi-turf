import type { NextRequest } from "next/server";
import { registerSchema } from "@/schemas/auth";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/server/auth/session";
import { registerCustomer, toSessionUser } from "@/server/auth/users";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimit } from "@/server/security/rateLimit";

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        if (!rateLimit(`register:${clientIp(req)}`, 5, 60 * 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many sign-ups from this connection. Try again later.", 429);
        }

        const input = registerSchema.parse(await readJson(req));
        const user = await registerCustomer(input);

        const { token, expires } = createSession(user.id);
        const res = ok({ user: toSessionUser(user) }, 201);
        res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
        return res;
    } catch (e) {
        return handleError(e);
    }
}