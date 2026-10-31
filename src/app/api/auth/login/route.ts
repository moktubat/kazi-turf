import type { NextRequest } from "next/server";
import { loginSchema } from "@/schemas/auth";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/server/auth/session";
import { authenticate, toSessionUser } from "@/server/auth/users";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimit } from "@/server/security/rateLimit";

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const input = loginSchema.parse(await readJson(req));

        const window = 10 * 60_000;

        if (
            !rateLimit(`login-ip:${clientIp(req)}`, 20, window) ||
            !rateLimit(`login-id:${input.identifier.toLowerCase()}`, 8, window)
        ) {
            throw new AppError(
                "RATE_LIMITED",
                "Too many attempts. Please wait a few minutes.",
                429
            );
        }

        const user = await authenticate(input.identifier, input.password);

        if (!user) {
            throw new AppError(
                "INVALID_CREDENTIALS",
                "Incorrect email, phone or password.",
                401
            );
        }

        const { token, expires } = await createSession(user.id);
        const res = ok({ user: toSessionUser(user) });
        res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
        return res;
    } catch (e) {
        return handleError(e);
    }
}