import type { NextRequest } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/server/auth/resetToken";
import { handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { clientIp } from "@/server/http";

const schema = z.object({ identifier: z.string().trim().min(3).max(120) });

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        if (!(await rateLimitAsync(`forgot:${clientIp(req)}`, 5, 15 * 60_000))) {
            return Response.json({ code: "RATE_LIMITED", message: "Too many requests." }, { status: 429 });
        }
        const { identifier } = schema.parse(await readJson(req));
        const result = await requestPasswordReset(identifier);
        return ok(result);
    } catch (e) {
        return handleError(e);
    }
}