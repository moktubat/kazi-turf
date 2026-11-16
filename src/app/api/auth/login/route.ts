import type { NextRequest } from "next/server";
import { loginSchema } from "@/schemas/auth";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/server/auth/session";
import { authenticate, parseIdentifier, toSessionUser } from "@/server/auth/users";
import { clearLoginFailures, isLocked, recordLoginFailure } from "@/server/auth/lockout";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { clearRateLimit, rateLimitAsync } from "@/server/security/rateLimit";

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const input = loginSchema.parse(await readJson(req));
        // "+8801…", "01…" and "0171-…" are the same account: one counter for all of them.
        const key = parseIdentifier(input.identifier).value;

        const window = 10 * 60_000;

        if (
            !(await rateLimitAsync(`login-ip:${clientIp(req)}`, 60, window)) ||
            !(await rateLimitAsync(`login-id:${key}`, 10, window))
        ) {
            throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes.", 429);
        }

        // Persistent per-account lockout (survives across serverless instances).
        const lockState = await isLocked(key);
        if (lockState.locked) {
            const mins = Math.ceil((lockState.lockedUntil!.getTime() - Date.now()) / 60_000);
            throw new AppError("ACCOUNT_LOCKED", `This account is temporarily locked. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`, 423);
        }

        const user = await authenticate(input.identifier, input.password);

        if (!user) {
            const result = await recordLoginFailure(key);
            if (result.locked) {
                throw new AppError("ACCOUNT_LOCKED", "Too many failed attempts. This account is temporarily locked.", 423);
            }
            throw new AppError("INVALID_CREDENTIALS", "Incorrect email, phone or password.", 401);
        }

        // Successful login — clear the failure counter.
        await clearLoginFailures(key);

        await clearRateLimit(`login-id:${key}`);
        await clearRateLimit(`login-ip:${clientIp(req)}`);


        const { token, expires } = await createSession(user.id);
        const res = ok({ user: toSessionUser(user) });
        res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
        return res;
    } catch (e) {
        return handleError(e);
    }
}