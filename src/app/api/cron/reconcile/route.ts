// Called every 5 minutes by cron-job.org (external scheduler; Vercel Hobby only runs daily crons):
//   GET https://kazisports.com/api/cron/reconcile
//   Authorization: Bearer <CRON_SECRET>
// Confirms bKash payments whose customer never came back, expires stale holds and
// releases expired HELD slots. Safe to repeat or overlap (see reconcilePending).
// Fails closed: no CRON_SECRET configured = every request is refused.
import { createHash, timingSafeEqual } from "crypto";
import { connection, type NextRequest } from "next/server";
import { clientIp, fail, handleError, ok } from "@/server/http";
import { reconcilePending } from "@/server/payments/reconcile";

// Room for a slow bKash; the job itself stops starting new checks after ~20 s.
export const maxDuration = 60;

/** Constant-time compare of equal-length hashes, so neither content nor length leaks through timing. */
function same(a: string, b: string) {
    const ha = createHash("sha256").update(a).digest();
    const hb = createHash("sha256").update(b).digest();
    return timingSafeEqual(ha, hb);
}

export async function GET(req: NextRequest) {
    await connection();
    try {
        const secret = process.env.CRON_SECRET;
        if (!secret || !same(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
            // Never log or echo the header: only that a call was refused, and from where.
            console.warn(`[cron] refused unauthorized request from ${clientIp(req)}${secret ? "" : " (CRON_SECRET not set)"}`);
            return fail("UNAUTHORIZED", "Not allowed.", 401);
        }
        return ok(await reconcilePending());
    } catch (e) {
        return handleError(e);
    }
}
