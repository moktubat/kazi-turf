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

/** Predictable error shape. Never leaks stack traces or database errors. */
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
    console.error("[api]", e instanceof Error ? e.message : "unknown error");
    return fail("SERVER_ERROR", "Something went wrong. Please try again.", 500);
}

export function clientIp(req: NextRequest): string {
    return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function readJson(req: NextRequest): Promise<unknown> {
    try {
        return await req.json();
    } catch {
        throw new AppError("BAD_JSON", "Invalid request.", 400);
    }
}