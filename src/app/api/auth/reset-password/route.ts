import type { NextRequest } from "next/server";
import { z } from "zod";
import { consumePasswordReset } from "@/server/auth/resetToken";
import { handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { customerPasswordSchema } from "@/schemas/password";

const schema = z.object({
    token: z.string().min(20).max(100),
    newPassword: customerPasswordSchema,
});

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const { token, newPassword } = schema.parse(await readJson(req));
        await consumePasswordReset(token, newPassword);
        return ok({ reset: true });
    } catch (e) {
        return handleError(e);
    }
}