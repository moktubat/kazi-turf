// Client fetch helper. Server errors always look like { code, message, fields? }.
export class ApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public status: number,
        public fields?: Record<string, string>
    ) {
        super(message);
    }
}

export function isAbort(e: unknown): boolean {
    return e instanceof DOMException && e.name === "AbortError";
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(url, {
            cache: "no-store",
            ...init,
            headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        });
    } catch (e) {
        if (isAbort(e)) throw e;
        throw new ApiError("NETWORK", "Network problem. Check your connection and try again.", 0);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new ApiError(
            data?.code ?? "UNKNOWN",
            data?.message ?? "Something went wrong. Please try again.",
            res.status,
            data?.fields
        );
    }
    return data as T;
}