// Extra CSRF guard on cookie-authenticated mutations (on top of SameSite=Lax).
import "server-only";
import type { NextRequest } from "next/server";
import { AppError } from "@/server/http";

export function assertSameOrigin(req: NextRequest) {
    const origin = req.headers.get("origin");
    if (!origin) return; // non-browser client, or origin stripped. SameSite still applies.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let originHost = "";
    try {
        originHost = new URL(origin).host;
    } catch {
        /* fall through to rejection */
    }
    if (!host || originHost !== host) {
        throw new AppError("FORBIDDEN", "Cross-site request blocked.", 403);
    }
}