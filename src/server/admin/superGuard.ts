import "server-only";
import type { NextRequest } from "next/server";
import { assertSuperAdmin } from "@/server/admin/access";
import { staffGuard } from "@/server/admin/guard";
import type { ServerUser } from "@/server/auth/session";

/**
 * Combined guard for Super-Admin-only routes.
 * Enforces, in order:
 *   1. Same-origin on writes (CSRF).
 *   2. Staff-or-above session (auth).
 *   3. Global admin rate limit.
 *   4. Super-Admin role.
 *
 * Use this instead of `staffGuard(req, true)` in every route that should be
 * Super-Admin-only. The role check is visible at the route boundary instead
 * of buried inside the operation function — so a future developer cannot
 * forget to enforce it.
 */
export async function superAdminGuard(req: NextRequest, mutate: boolean): Promise<ServerUser> {
    const user = await staffGuard(req, mutate);
    assertSuperAdmin(user);
    return user;
}