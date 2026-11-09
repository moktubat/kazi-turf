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

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(url, options);
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        console.error("[api] network error:", url, e);
        throw new ApiError("NETWORK", "Network error. Check your connection.", 0);
    }

    // Read the response as text first, then try to parse as JSON
    const text = await res.text();
    let data: any;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        // FIX: Non-JSON response — the server returned an HTML error page or crashed.
        // Log the response so the developer can see what happened.
        console.error("[api] Non-JSON response from", url);
        console.error("[api] Status:", res.status, res.statusText);
        console.error("[api] Response preview:", text.slice(0, 500));
        throw new ApiError(
            "PARSE_ERROR",
            `Server returned ${res.status} ${res.statusText} (non-JSON response). Check the terminal for the actual error.`,
            res.status
        );
    }

    if (!res.ok) {
        throw new ApiError(
            data?.code ?? "ERROR",
            data?.message ?? `Request failed with status ${res.status}`,
            res.status,
            data?.fields
        );
    }

    return data as T;
}

export function isAbort(e: unknown): boolean {
    return e instanceof DOMException && e.name === "AbortError";
}