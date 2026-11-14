import { NextResponse, type NextRequest } from "next/server";

const PROD = process.env.NODE_ENV === "production";

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

// Random nonce generated per-request for inline scripts/styles.
function generateNonce(): string {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes));
}

export function proxy(req: NextRequest) {
    if (req.nextUrl.pathname.startsWith("/api/")) return apply(NextResponse.next());

    const nonce = generateNonce();

    const csp = [
        "default-src 'self'",
        // Nonce-based script-src: Next.js inline scripts get the nonce attribute.
        `script-src 'self' 'nonce-${nonce}'${PROD ? "" : " 'unsafe-eval'"}`,
        // Tailwind injects inline styles; 'unsafe-inline' on style-src is acceptable.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https://res.cloudinary.com",
        "font-src 'self' https://fonts.gstatic.com",
        "frame-src 'self' https://www.google.com https://maps.google.com",
        `connect-src 'self'${PROD ? "" : " ws: wss:"}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        ...(PROD ? ["upgrade-insecure-requests"] : []),
    ].join("; ");

    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", csp);
    // Make the nonce available to Next.js via a request header so it can be applied
    // to inline scripts rendered by the App Router.
    res.headers.set("x-nonce", nonce);
    return apply(res);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|webp|avif|svg|ico|woff2?)$).*)"],
};