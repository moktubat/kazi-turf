import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { getBookingDetail } from "@/server/admin/search";
import { handleError, ok } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, false);
        const { code } = await params;
        return ok(getBookingDetail(user, code));
    } catch (e) {
        return handleError(e);
    }
}