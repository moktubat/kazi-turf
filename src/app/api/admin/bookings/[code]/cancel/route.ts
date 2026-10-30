import type { NextRequest } from "next/server";
import { cancelSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { cancelBooking } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        const input = cancelSchema.parse(await readJson(req));
        return ok({ booking: await cancelBooking(user, code, input.reason) });
    } catch (e) {
        return handleError(e);
    }
}