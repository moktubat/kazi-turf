/** Lean documents carry Mongo's _id. Our types do not, so strip it. */
export function plain<T>(doc: unknown): T {
    const { _id, ...rest } = doc as Record<string, unknown>;
    void _id;
    return rest as T;
}

export const plainAll = <T>(docs: unknown[]): T[] => docs.map((d) => plain<T>(d));

export function isDup(e: unknown): boolean {
    return (e as { code?: number } | null)?.code === 11000;
}

/** Which unique field collided, e.g. "phone" or "email". */
export function dupField(e: unknown): string | null {
    const kp = (e as { keyPattern?: Record<string, number> } | null)?.keyPattern;
    return kp ? (Object.keys(kp)[0] ?? null) : null;
}