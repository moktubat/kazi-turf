import "server-only";
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

export function hashPasswordSync(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, KEYLEN, PARAMS);
    return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) =>
        scrypt(password, salt, KEYLEN, PARAMS, (err, key) => (err ? reject(err) : resolve(key)))
    );
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await derive(password, salt);
    return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [alg, saltB64, hashB64] = stored.split("$");
    if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = await derive(password, Buffer.from(saltB64, "base64"));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Verified when the account does not exist, so response time does not reveal it.
export const DUMMY_HASH = hashPasswordSync("timing-equalizer-not-a-real-password");