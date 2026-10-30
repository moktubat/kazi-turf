// Server-side sessions: random token in an HTTP-only cookie, hash stored server-side.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { store } from "@/server/store";
import type { SessionUser } from "@/types";

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
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: PROD,
        path: "/",
        expires,
    };
}

export function createSession(userId: string): { token: string; expires: Date } {
    const now = Date.now();
    store.sessions = store.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);

    const token = randomBytes(32).toString("base64url");
    const expires = new Date(now + TTL_MS);
    store.sessions.push({
        keyHash: hashToken(token),
        userId,
        expiresAt: expires.toISOString(),
        createdAt: new Date(now).toISOString(),
    });
    return { token, expires };
}

export function endSession(token?: string) {
    if (!token) return;
    const h = hashToken(token);
    store.sessions = store.sessions.filter((s) => s.keyHash !== h);
}

/** Used after a password change: sign out everywhere except the current device. */
export function endOtherSessions(userId: string, keepToken?: string) {
    const keep = keepToken ? hashToken(keepToken) : null;
    store.sessions = store.sessions.filter((s) => s.userId !== userId || s.keyHash === keep);
}

function userForToken(token: string | undefined): ServerUser | null {
    if (!token) return null;
    const h = hashToken(token);
    const session = store.sessions.find((s) => s.keyHash === h);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;

    const user = store.users.find((u) => u.id === session.userId);
    if (!user || user.status !== "ACTIVE") return null;

    return {
        id: user.id,
        name: user.name,
        role: user.role,
        phone: user.phone,
        email: user.email,
        branchIds: user.branchIds,
        permissions: user.permissions,
    };
}

export const getSessionUser = cache(async (): Promise<ServerUser | null> => {
    const jar = await cookies();
    return userForToken(jar.get(SESSION_COOKIE)?.value);
});