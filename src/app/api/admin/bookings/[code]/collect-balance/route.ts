import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { collectBalance } from "@/server/admin/operations";
import { handleError, ok } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        return ok({ booking: collectBalance(user, code) });
    } catch (e) {
        return handleError(e);
    }
}