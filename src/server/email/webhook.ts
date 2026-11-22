import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const TOLERANCE_S = 5 * 60;

/**
 * Verifies a Resend webhook (Svix format): HMAC-SHA256 over "id.timestamp.body" with the
 * base64 secret after "whsec_", compared in constant time; the timestamp must be within
 * 5 minutes so a captured request cannot be replayed later.
 */
export function verifyResendWebhook(
    secret: string,
    h: { id: string | null; timestamp: string | null; signature: string | null },
    body: string,
    nowS: number = Math.floor(Date.now() / 1000)
): boolean {
    if (!h.id || !h.timestamp || !h.signature) return false;
    const ts = Number(h.timestamp);
    if (!Number.isInteger(ts) || Math.abs(nowS - ts) > TOLERANCE_S) return false;
    const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    if (key.length === 0) return false;
    const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${body}`).digest();
    // The header may carry several space-separated signatures ("v1,<base64> v1,<base64>").
    return h.signature.split(" ").some((part) => {
        const [version, sig] = part.split(",");
        if (version !== "v1" || !sig) return false;
        const given = Buffer.from(sig, "base64");
        return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
