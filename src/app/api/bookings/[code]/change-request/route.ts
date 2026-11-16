import type { NextRequest } from "next/server";
import { changeRequestSchema } from "@/schemas/account";
import { requireUser } from "@/server/auth/guards";
import { requestChange } from "@/server/bookings/account";
import { AppError, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        assertSameOrigin(req);
        const user = await requireUser();
        if (!(await rateLimitAsync(`change:${user.id}`, 5, 10 * 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many requests. Please wait a few minutes.", 429);
        }
        const { code } = await params;
        const input = changeRequestSchema.parse(await readJson(req));
        return ok({ changeRequest: await requestChange(user, code, input) }, 201);
    } catch (e) {
        return handleError(e);
    }
}