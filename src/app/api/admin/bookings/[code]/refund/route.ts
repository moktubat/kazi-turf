import type { NextRequest } from "next/server";
import { refundSchema } from "@/schemas/admin";
import { superAdminGuard } from "@/server/admin/superGuard";
import { recordRefund } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

// Super Admin only (checked inside recordRefund).
export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await superAdminGuard(req, true);
        const { code } = await params;
        const input = refundSchema.parse(await readJson(req));
        return ok({ booking: await recordRefund(user, code, input.note) });
    } catch (e) {
        return handleError(e);
    }
}