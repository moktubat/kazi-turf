import type { ZodError } from "zod";

/** First message per field path, e.g. { "refund.tiers.0.when": "Describe the window" }. */
export function zodFields(e: ZodError): Record<string, string> {
    const out: Record<string, string> = {};
    for (const issue of e.issues) {
        const key = issue.path.length ? issue.path.map(String).join(".") : "form";
        if (!out[key]) out[key] = issue.message;
    }
    return out;
}