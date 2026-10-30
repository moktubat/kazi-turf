import type { NextRequest } from "next/server";
import { staffCreateSchema, staffUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createStaff, updateStaff } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";

// Responses never include password hashes or any credential.
export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await createStaff(user, staffCreateSchema.parse(await readJson(req)));
        return ok({ saved: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await updateStaff(user, staffUpdateSchema.parse(await readJson(req)));
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}