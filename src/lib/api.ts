export class ApiError extends Error {
    code: string;
    status: number;
    fields?: Record<string, string>;

    constructor(code: string, message: string, status: number, fields?: Record<string, string>) {
        super(message);
        this.name = "ApiError";
        this.code = code;
        this.status = status;
        this.fields = fields;
    }
}

interface ErrorBody {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
}

// Browser code: nothing about the server response is printed to the console. Every failure
// becomes an ApiError with a plain message that the calling screen shows. The server keeps the
// details in its own log (with the "Reference" id quoted in 500 messages).
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(url, options);
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        throw new ApiError("NETWORK", "Network error. Check your connection.", 0);
    }

    const text = await res.text();
    let data: unknown;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        // Not JSON (an HTML error page, a proxy timeout…).
        throw new ApiError("PARSE_ERROR", "Something went wrong. Please try again.", res.status);
    }

    if (!res.ok) {
        const body = (data ?? {}) as ErrorBody;
        throw new ApiError(
            body.code ?? "ERROR",
            body.message ?? (res.status >= 500 ? "Something went wrong. Please try again." : `Request failed (${res.status}).`),
            res.status,
            body.fields
        );
    }

    return data as T;
}

export function isAbort(e: unknown): boolean {
    return e instanceof DOMException && e.name === "AbortError";
}
