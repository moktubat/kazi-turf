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

export function proxy(req: NextRequest) {
    if (req.nextUrl.pathname.startsWith("/api/")) return apply(NextResponse.next());

    const csp = [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${PROD ? "" : " 'unsafe-eval'"}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https://res.cloudinary.com",
        "font-src 'self' https://fonts.gstatic.com",
        `connect-src 'self'${PROD ? "" : " ws: wss:"}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
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