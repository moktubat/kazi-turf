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

export function fail(code: string, message: string, status: number, fields?: Record<string, string>) {
    return NextResponse.json({ code, message, ...(fields ? { fields } : {}) }, { status, headers: NO_STORE });
}

export function handleError(e: unknown) {
    if (e instanceof AppError) return fail(e.code, e.message, e.status, e.fields);
    if (e instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of e.issues) {
            const key = String(issue.path[0] ?? "form");
            if (!fields[key]) fields[key] = issue.message;
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


export function clientIp(req: NextRequest): string {
    const headers = req.headers;

    // Vercel sets this to the real visitor IP.
    const vercel = headers.get("x-vercel-forwarded-for");
    if (vercel) return vercel.split(",")[0].trim();

    // Standard proxy header. First entry is the original client.
    const xff = headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();

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