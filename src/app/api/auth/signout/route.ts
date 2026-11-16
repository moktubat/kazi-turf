import type { NextRequest } from "next/server";
import { SESSION_COOKIE, endSession, sessionCookieOptions } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/security/origin";
import { handleError, redirectTo } from "@/server/http";

// Header "Logout" posts a plain form here (Customer, Staff and Super Admin alike).
// Always ends on the Home page of whatever address the browser is using.
export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        await endSession(req.cookies.get(SESSION_COOKIE)?.value);

        const res = redirectTo("/");
        res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
        return res;
    } catch (e) {
        return handleError(e);
    }
}
