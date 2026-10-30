// Security headers on every response, plus a per-request nonce CSP for pages (spec §13).
// Pages are already dynamic (the layout reads the session cookie), so nonces work everywhere.
// NOTE: on Next.js 16 this file is named src/proxy.ts and the function is `proxy`. Contents are the same.
import { NextResponse, type NextRequest } from "next/server";

const PROD = process.env.NODE_ENV === "production";

const baseHeaders: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    ...(PROD ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
};

function apply(res: NextResponse) {
    for (const [k, v] of Object.entries(baseHeaders)) res.headers.set(k, v);
    return res;
}

export function middleware(req: NextRequest) {
    // API routes return JSON/CSV/HTML files, not pages. They get the basic headers only.
    // No CORS headers are added anywhere: the API is same-origin only, by design.
    if (req.nextUrl.pathname.startsWith("/api/")) return apply(NextResponse.next());

    const nonce = btoa(crypto.randomUUID());
    const csp = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${PROD ? "" : " 'unsafe-eval'"}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src 'self'${PROD ? "" : " ws: wss:"}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        ...(PROD ? ["upgrade-insecure-requests"] : []),
    ].join("; ");

    const headers = new Headers(req.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp); // Next reads this to nonce its own scripts

    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return apply(res);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|webp|avif|svg|ico|woff2?)$).*)"],
};