// Password-reset email links land here, not on /login. The token moves into a short-lived
// httpOnly cookie and the browser is sent to a clean /login?mode=reset, so the token never
// sits in the address bar, the browser history, the Referer header or analytics page URLs.
import type { NextRequest } from "next/server";
import { RESET_COOKIE, RESET_TOKEN_PATTERN, resetCookieOptions } from "@/server/auth/resetToken";
import { redirectTo } from "@/server/http";

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get("reset") ?? "";
    if (!RESET_TOKEN_PATTERN.test(token)) return redirectTo("/login", "?mode=reset");

    const res = redirectTo("/login", "?mode=reset");
    res.cookies.set(RESET_COOKIE, token, resetCookieOptions());
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
}
