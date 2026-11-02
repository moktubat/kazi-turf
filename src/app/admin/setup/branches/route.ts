import type { NextRequest } from "next/server";
import { branchUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { updateBranch } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";

export async function PATCH(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await updateBranch(user, branchUpdateSchema.parse(await readJson(req)));
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}