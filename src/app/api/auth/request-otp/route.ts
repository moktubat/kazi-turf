import type { NextRequest } from "next/server";
import { z } from "zod";
import { issueOtp } from "@/server/auth/otp";
import { handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { clientIp } from "@/server/http";
import { phoneInput } from "@/schemas/common";

const schema = z.object({ phone: phoneInput });

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        if (!(await rateLimitAsync(`otp:${clientIp(req)}`, 3, 10 * 60_000))) {
            return Response.json({ code: "RATE_LIMITED", message: "Too many OTP requests." }, { status: 429 });
        }
        const { phone } = schema.parse(await readJson(req));
        const result = await issueOtp(phone);
        return ok(result);
    } catch (e) {
        return handleError(e);
    }
}