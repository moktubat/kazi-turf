// Server-side sessions: random token in an HTTP-only cookie, only its hash is stored (in MongoDB).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { SessionModel, UserModel } from "@/models";
import { connectDb } from "@/server/db/connect";
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
  const s = await SessionModel.findOne({ keyHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean<any>();
  if (!s) return null;

  const u = await UserModel.findOne({ id: s.userId, status: "ACTIVE" }).lean<any>();
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

export const getSessionUser = cache(async (): Promise<ServerUser | null> => {
  const jar = await cookies();
  return userForToken(jar.get(SESSION_COOKIE)?.value);
});