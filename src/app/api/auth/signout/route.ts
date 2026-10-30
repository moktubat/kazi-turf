import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, endSession, sessionCookieOptions } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/security/origin";
import { handleError } from "@/server/http";

// Header "Logout" posts a plain form here. Always ends on the Home page.
export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        endSession(req.cookies.get(SESSION_COOKIE)?.value);

        const url = req.nextUrl.clone();
        url.pathname = "/";
        url.search = "";

        const res = NextResponse.redirect(url, 303);
        res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
        return res;
    } catch (e) {
        return handleError(e);
    }
}