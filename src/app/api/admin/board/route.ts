import type { NextRequest } from "next/server";
import { boardQuerySchema } from "@/schemas/admin";
import { getBoard } from "@/server/admin/board";
import { staffGuard } from "@/server/admin/guard";
import { handleError, ok } from "@/server/http";

export async function GET(req: NextRequest) {
    try {
        const user = await staffGuard(req, false);
        const sp = req.nextUrl.searchParams;
        const q = boardQuerySchema.parse({
            branch: sp.get("branch") ?? undefined,
            date: sp.get("date") ?? undefined,
        });
        return ok(getBoard(user, q.branch, q.date));
    } catch (e) {
        return handleError(e);
    }
}