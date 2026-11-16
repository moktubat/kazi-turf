// Customer: (re)send a code to the email they want on their account.
import type { NextRequest } from "next/server";
import { emailChangeCodeSchema } from "@/schemas/account";
import { requireUser } from "@/server/auth/guards";
import { sendEmailChangeCode } from "@/server/auth/users";
import { AppError, clientIp, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await requireUser();
        if (!(await rateLimitAsync(`email-code:${user.id}`, 6, 10 * 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many requests. Please wait a few minutes.", 429);
        }
        const { email } = emailChangeCodeSchema.parse(await readJson(req));
        return ok(await sendEmailChangeCode(user, email, { ip: clientIp(req) }));
    } catch (e) {
        return handleError(e);
    }
}
