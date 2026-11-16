// Customer: confirm the code; only then does the new email replace the account email.
import type { NextRequest } from "next/server";
import { emailChangeVerifySchema } from "@/schemas/account";
import { requireUser } from "@/server/auth/guards";
import { confirmEmailChange } from "@/server/auth/users";
import { AppError, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await requireUser();
        if (!(await rateLimitAsync(`email-verify:${user.id}`, 10, 10 * 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes.", 429);
        }
        const { email, otpCode } = emailChangeVerifySchema.parse(await readJson(req));
        return ok(await confirmEmailChange(user, email, otpCode));
    } catch (e) {
        return handleError(e);
    }
}
