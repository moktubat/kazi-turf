import type { NextRequest } from "next/server";
import { profileSchema } from "@/schemas/account";
import { requireUser } from "@/server/auth/guards";
import { updateProfile } from "@/server/auth/users";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { assertSameOrigin } from "@/server/security/origin";

export async function PATCH(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await requireUser();
        // Saving a phone/email answers "already used", so cap how fast an account can probe it.
        if (!(await rateLimitAsync(`profile:${user.id}`, 10, 10 * 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many changes. Please wait a few minutes.", 429);
        }
        const input = profileSchema.parse(await readJson(req));
        // Await: otherwise a failed save (e.g. phone already used) was reported as success.
        return ok({ profile: await updateProfile(user.id, input, { ip: clientIp(req) }) });
    } catch (e) {
        return handleError(e);
    }
}