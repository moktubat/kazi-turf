import type { NextRequest } from "next/server";
import { branchSchema, branchUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createBranch, updateBranch } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";

export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await createBranch(user, branchSchema.parse(await readJson(req)));
        return ok({ saved: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await updateBranch(user, branchUpdateSchema.parse(await readJson(req)));
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}