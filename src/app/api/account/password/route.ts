import type { NextRequest } from "next/server";
import { passwordSchema } from "@/schemas/account";
import { requireUser } from "@/server/auth/guards";
import { SESSION_COOKIE, endOtherSessions } from "@/server/auth/session";
import { changePassword } from "@/server/auth/users";
import { AppError, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimit } from "@/server/security/rateLimit";

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await requireUser();
        if (!rateLimit(`pw:${user.id}`, 5, 10 * 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes.", 429);
        }

        const input = passwordSchema.parse(await readJson(req));
        await changePassword(user.id, input.currentPassword, input.newPassword);

        // Sign out every other device. This one stays signed in.
        endOtherSessions(user.id, req.cookies.get(SESSION_COOKIE)?.value);
        return ok({ changed: true });
    } catch (e) {
        return handleError(e);
    }
}