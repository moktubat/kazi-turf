// Called by a scheduler every few minutes with:  Authorization: Bearer <CRON_SECRET>
// (Vercel Cron sends this header automatically when CRON_SECRET is set.)
import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { fail, handleError, ok } from "@/server/http";
import { reconcilePending } from "@/server/payments/reconcile";

function same(a: string, b: string) {
    const ha = createHash("sha256").update(a).digest();
    const hb = createHash("sha256").update(b).digest();
    return timingSafeEqual(ha, hb);
}

export async function GET(req: NextRequest) {
    try {
        const secret = process.env.CRON_SECRET;
        if (!secret || !same(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
            return fail("UNAUTHORIZED", "Not allowed.", 401);
        }
        return ok(await reconcilePending());
    } catch (e) {
        return handleError(e);
    }
}