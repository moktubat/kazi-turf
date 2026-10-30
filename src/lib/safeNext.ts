// Only same-site relative paths are allowed as a post-login destination (no open redirects).
export function safeNext(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
    if (/[\u0000-\u001f]/.test(value)) return null;
    if (value.startsWith("/login") || value.startsWith("/api")) return null;
    return value;
}