import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { deletePitch } from "@/server/admin/setup";
import { handleError, ok } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { id } = await params;
        await deletePitch(user, id);
        return ok({ deleted: true });
    } catch (e) {
        return handleError(e);
    }
}