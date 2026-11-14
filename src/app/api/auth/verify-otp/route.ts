import type { NextRequest } from "next/server";
import { z } from "zod";
import { verifyOtp } from "@/server/auth/otp";
import { handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";

const schema = z.object({
    phone: z.string().min(10).max(20),
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const { phone, code } = schema.parse(await readJson(req));
        await verifyOtp(phone, code);
        return ok({ verified: true });
    } catch (e) {
        return handleError(e);
    }
}