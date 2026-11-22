import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
    constructor(
        public code: string,
        message: string,
        public status = 400,
        public fields?: Record<string, string>
    ) {
        super(message);
    }
}

const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, status = 200) {
    return NextResponse.json(data, { status, headers: NO_STORE });
}

/**
 * 303 to a same-site path. The Location is RELATIVE on purpose: `req.nextUrl` is built from
 * the server's listen address (e.g. 0.0.0.0:3000 under `next dev -H 0.0.0.0`), not the
 * address the browser used, so an absolute URL built from it can be unreachable. The browser
 * resolves "/" against its own current origin (localhost, LAN IP or the live domain).
 */
export function redirectTo(path: string, search = "") {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("redirectTo: same-site paths only");
    return new NextResponse(null, { status: 303, headers: { Location: `${path}${search}`, ...NO_STORE } });
}

export function fail(code: string, message: string, status: number, fields?: Record<string, string>) {
    return NextResponse.json({ code, message, ...(fields ? { fields } : {}) }, { status, headers: NO_STORE });
}

export function handleError(e: unknown) {
    if (e instanceof AppError) return fail(e.code, e.message, e.status, e.fields);
    if (e instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of e.issues) {
            // Full path ("refund.tiers.0.when") for nested forms, plus the top-level key for flat ones.
            const full = issue.path.length ? issue.path.map(String).join(".") : "form";
            const top = String(issue.path[0] ?? "form");
            if (!fields[full]) fields[full] = issue.message;
            if (!fields[top]) fields[top] = issue.message;
        }
        return fail("VALIDATION", "Please check the highlighted fields.", 400, fields);
    }

    // Log the real error server-side with a correlation id.
    const correlationId = crypto.randomUUID();
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(`[api:${correlationId}]`, msg, stack);

    // Return a generic message to the client. The correlationId lets support
    // look up the actual error in logs without exposing backend state.
    return fail("SERVER_ERROR", `Something went wrong. Reference: ${correlationId}.`, 500);
}


/**
 * The visitor's IP, for rate limits and abuse caps.
 *
 * On Vercel (VERCEL=1 is set by the platform) the edge overwrites x-vercel-forwarded-for and
 * x-forwarded-for with the real client address, so the first entry can be trusted.
 * Anywhere else the LEFTMOST X-Forwarded-For entry is whatever the client sent (Next.js only
 * fills the header in when it is missing), so trusting it let anyone dodge every per-IP limit
 * by sending a fake header. There the RIGHTMOST entry is used: the address recorded by the
 * reverse proxy closest to the app. Self-hosting must therefore sit behind one proxy that
 * appends to X-Forwarded-For (nginx, Caddy, a load balancer).
 */
export function clientIp(req: NextRequest): string {
    const headers = req.headers;
    const onVercel = process.env.VERCEL === "1";

    if (onVercel) {
        const vercel = headers.get("x-vercel-forwarded-for");
        if (vercel) return vercel.split(",")[0].trim();
    }

    const xff = headers.get("x-forwarded-for");
    if (xff) {
        const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
        const ip = onVercel ? hops[0] : hops[hops.length - 1];
        if (ip) return ip;
    }

    // Some proxies set this.
    const real = headers.get("x-real-ip");
    if (real) return real.trim();

    // Fallback — this is the proxy/load-balancer, not the real client,
    // but it's better than "undefined" (which would share one bucket globally).
    return req.headers.get("x-forwarded")?.split(" ")[0]?.trim() ?? "0.0.0.0";
}


export async function readJson(req: NextRequest): Promise<unknown> {
    try {
        return await req.json();
    } catch {
        throw new AppError("BAD_JSON", "Invalid request.", 400);
    }
}