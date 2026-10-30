import "server-only";
import type { NextRequest } from "next/server";
import { requireStaff } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { AppError } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimit } from "@/server/security/rateLimit";

/** Every admin route: same-origin on writes, staff session, rate limit. Branch scope is checked per resource. */
export async function staffGuard(req: NextRequest, mutate: boolean): Promise<ServerUser> {
    if (mutate) assertSameOrigin(req);
    const user = await requireStaff();
    if (!rateLimit(`admin:${user.id}`, 240, 60_000)) {
        throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
    }
    return user;
}