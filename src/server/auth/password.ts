import "server-only";
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "crypto";
import { staffPasswordSchema } from "@/schemas/password";
import { AppError } from "@/server/http";

const KEYLEN = 64;
type Params = { N: number; r: number; p: number };

/**
 * OWASP Password Storage Cheat Sheet: scrypt N=2^17, r=8, p=1, or an equal-strength
 * trade-off. N=2^14, r=8, p=5 is the listed option with the least memory (16 MiB per hash),
 * which suits serverless functions; it costs about 5x the CPU of the old parameters.
 * Stored as  scrypt2$N$r$p$salt$hash  so the parameters can be raised again later.
 */
const PARAMS: Params = { N: 16384, r: 8, p: 5 };
/** Hashes written before 2026-11-22:  scrypt$salt$hash  with these parameters. */
const LEGACY: Params = { N: 16384, r: 8, p: 1 };
const MAXMEM = 64 * 1024 * 1024;

const encode = (salt: Buffer, hash: Buffer, p: Params = PARAMS) =>
    `scrypt2$${p.N}$${p.r}$${p.p}$${salt.toString("base64")}$${hash.toString("base64")}`;

export function hashPasswordSync(password: string): string {
    const salt = randomBytes(16);
    return encode(salt, scryptSync(password, salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM }));
}

function derive(password: string, salt: Buffer, p: Params = PARAMS): Promise<Buffer> {
    return new Promise((resolve, reject) =>
        scrypt(password, salt, KEYLEN, { ...p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)))
    );
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    return encode(salt, await derive(password, salt));
}

function parse(stored: string): { params: Params; salt: Buffer; hash: Buffer; legacy: boolean } | null {
    const parts = stored.split("$");
    if (parts[0] === "scrypt" && parts.length === 3 && parts[1] && parts[2]) {
        return { params: LEGACY, salt: Buffer.from(parts[1], "base64"), hash: Buffer.from(parts[2], "base64"), legacy: true };
    }
    if (parts[0] === "scrypt2" && parts.length === 6) {
        const [N, r, p] = parts.slice(1, 4).map(Number);
        // Bounds: a corrupted/hostile hash must not make us run an enormous scrypt.
        if (![N, r, p].every(Number.isInteger) || N < 1024 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return null;
        return { params: { N, r, p }, salt: Buffer.from(parts[4], "base64"), hash: Buffer.from(parts[5], "base64"), legacy: false };
    }
    return null;
}

/**
 * Checks a password. `upgraded` is a fresh hash with the current parameters when the stored
 * one is older and the password was right; the caller saves it (see authenticate()).
 * For an old hash the current-parameter hash is computed either way, so the response time
 * of a not-yet-upgraded account stays close to every other login.
 */
export async function checkPassword(password: string, stored: string): Promise<{ ok: boolean; upgraded?: string }> {
    const rec = parse(stored);
    if (!rec) return { ok: false };
    const actual = await derive(password, rec.salt, rec.params);
    const ok = actual.length === rec.hash.length && timingSafeEqual(actual, rec.hash);
    if (!rec.legacy) return { ok };
    const salt = randomBytes(16);
    const fresh = await derive(password, salt);
    return ok ? { ok, upgraded: encode(salt, fresh) } : { ok };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    return (await checkPassword(password, stored)).ok;
}

/**
 * Staff and Super Admin accounts are created with the stricter staff policy. The customer
 * password routes (change, reset) only validate the customer rule, so the role-specific rule
 * is enforced here, wherever a password is set for an existing account.
 */
export function assertPasswordPolicy(role: string, password: string, field = "newPassword") {
    if (role === "CUSTOMER") return;
    const r = staffPasswordSchema.safeParse(password);
    if (!r.success) {
        const message = r.error.issues[0]?.message ?? "Use a stronger password";
        throw new AppError("VALIDATION", message, 400, { [field]: message });
    }
}

// Verified when the account does not exist, so response time does not reveal it.
// A constant (precomputed with the current PARAMS) so a cold start does not spend ~0.5 s
// hashing at import time. It is the hash of a throwaway string, not of any real password.
export const DUMMY_HASH =
    "scrypt2$16384$8$5$Oxh6wmjABg/9Tf4nb548PA==$htjvEKjiLtTG4NFCemevVff87azoD0YlVsv4FoJjQbP+8JUb1In5xx8rMhibGs028hZuk2P3UVr2NZLNr8xOog==";