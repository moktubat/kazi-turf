// Server-side sessions: random token in an HTTP-only cookie, only its hash is stored (in MongoDB).
import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { SessionModel, UserModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import type { SessionUser } from "@/types";
import type { User } from "@/types/user"
import { cacheLife } from "next/cache";

const PROD = process.env.NODE_ENV === "production";
// __Host- prefix pins the cookie to this exact host over HTTPS in production.
export const SESSION_COOKIE = PROD ? "__Host-kt_session" : "kt_session";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ServerUser extends SessionUser {
    phone: string;
    email: string | null;
    branchIds: string[];
    permissions: string[];
}

export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expires: Date) {
    return { httpOnly: true, sameSite: "lax" as const, secure: PROD, path: "/", expires };
}

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
    await connectDb();
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + TTL_MS);
    await SessionModel.create({ keyHash: hashToken(token), userId, expiresAt: expires, createdAt: new Date() });
    return { token, expires };
}

export async function endSession(token?: string) {
    if (!token) return;
    await connectDb();
    await SessionModel.deleteOne({ keyHash: hashToken(token) });
}

/** After a password change or reset: sign out everywhere except the current device. */
export async function endOtherSessions(userId: string, keepToken?: string) {
    await connectDb();
    await SessionModel.deleteMany({ userId, ...(keepToken ? { keyHash: { $ne: hashToken(keepToken) } } : {}) });
}

async function userForToken(token: string | undefined): Promise<ServerUser | null> {
    if (!token) return null;
    await connectDb();

    // Type the session document to only extract what we need
    const s = await SessionModel.findOne({
        keyHash: hashToken(token),
        expiresAt: { $gt: new Date() }
    }).lean<{ userId: string } | null>();

    if (!s) return null;

    // Type the user document using the existing User interface
    const u = await UserModel.findOne({ id: s.userId, status: "ACTIVE" }).lean<User | null>();
    if (!u) return null;

    return {
        id: u.id,
        name: u.name,
        role: u.role,
        phone: u.phone,
        email: u.email ?? null,
        branchIds: u.branchIds ?? [],
        permissions: u.permissions ?? [],
    };
}

export async function getSessionUser(): Promise<ServerUser | null> {
    "use cache: private";
    cacheLife({ stale: 30 });
    const jar = await cookies();
    return userForToken(jar.get(SESSION_COOKIE)?.value);
}