import type { NextRequest } from "next/server";
import { checkInSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { checkIn } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        const input = checkInSchema.parse(await readJson(req));
        return ok({ booking: await checkIn(user, code, input) });
    } catch (e) {
        return handleError(e);
    }
}