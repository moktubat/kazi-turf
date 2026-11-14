import type { NextRequest } from "next/server";
import { staffCreateSchema, staffUpdateSchema } from "@/schemas/setup";
import { createStaff, updateStaff } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";
import { superAdminGuard } from "@/server/admin/superGuard";

export async function POST(req: NextRequest) {
    try {
        const user = await superAdminGuard(req, true);
        const parsed = staffCreateSchema.parse(await readJson(req));
        await createStaff(user, parsed);
        revalidatePath("/admin/setup", "page");
        return ok({ saved: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await superAdminGuard(req, true);
        const parsed = staffUpdateSchema.parse(await readJson(req));
        await updateStaff(user, parsed);
        revalidatePath("/admin/setup", "page");
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}