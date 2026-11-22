import { NextResponse, type NextRequest } from "next/server";
import { site } from "@/data/site";
import { ANALYTICS_ENABLED, GA_CSP } from "@/lib/analytics";

const PROD = process.env.NODE_ENV === "production";

// Google Tag Manager / Analytics hosts are allowed only when one of them is configured.
const ga = (hosts: readonly string[]) => (ANALYTICS_ENABLED ? ` ${hosts.join(" ")}` : "");

// 'self' is tied to the origin the page was opened on. If the page is opened
// over http://, upgrade-insecure-requests rewrites the form POST to https://
// before the form-action check, so 'self' no longer matches and Chrome blocks
// the Logout form. Listing the site's https origins explicitly keeps form
// posts working no matter which origin the page was opened on.
const formAction = ["form-action", "'self'", site.url, site.url.replace("://", "://www.")].join(" ");

const baseHeaders: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    ...(PROD ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" } : {}),
};

function apply(res: NextResponse) {
    for (const [k, v] of Object.entries(baseHeaders)) res.headers.set(k, v);
    return res;
}

export function proxy(req: NextRequest) {
    if (req.nextUrl.pathname.startsWith("/api/")) return apply(NextResponse.next());

    // Password-reset emails sent before 2026-11-22 link to /login?reset=<token>. Bounce them
    // through the reset-link route as a real HTTP redirect, before any HTML (and analytics,
    // which would record the URL) reaches the browser.
    const legacyReset = req.nextUrl.pathname === "/login" ? req.nextUrl.searchParams.get("reset") : null;
    if (legacyReset) {
        // The proxy runtime needs an absolute Location. Build it from the address the browser
        // used (Host header), not req.url, which can be the server's listen address (see redirectTo()).
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
        const target = new URL(`/api/auth/reset-link?reset=${encodeURIComponent(legacyReset)}`, host ? `${proto}://${host}` : req.url);
        const res = NextResponse.redirect(target, 307);
        res.headers.set("Cache-Control", "no-store");
        return apply(res);
    }

    const csp = [
        "default-src 'self'",
        // Next.js injects inline bootstrap scripts without a nonce attribute,
        // so 'unsafe-inline' is required in production. 'unsafe-eval' only in dev.
        `script-src 'self' 'unsafe-inline'${PROD ? "" : " 'unsafe-eval'"}${ga(GA_CSP.script)}`,
        // 'unsafe-inline' above has to stay: a nonce CSP needs every page dynamically rendered
        // and Next.js documents it as incompatible with Partial Prerendering (cacheComponents),
        // which this app is built on. What CAN be closed is inline event-handler ATTRIBUTES
        // (onerror=, onclick=…), the usual HTML-injection payload; React never renders them.
        "script-src-attr 'none'",
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${ga(GA_CSP.style)}`,
        `img-src 'self' data: blob: https://res.cloudinary.com${ga(GA_CSP.img)}`,
        "font-src 'self' https://fonts.gstatic.com",
        `frame-src 'self' https://www.google.com https://maps.google.com${ga(GA_CSP.frame)}`,
        `connect-src 'self'${PROD ? "" : " ws: wss:"}${ga(GA_CSP.connect)}`,
        "object-src 'none'",
        "base-uri 'self'",
        formAction,
        "frame-ancestors 'none'",
        ...(PROD ? ["upgrade-insecure-requests"] : []),
    ].join("; ");

    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", csp);
    return apply(res);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|webp|avif|svg|ico|woff2?)$).*)"],
};