import type { NextRequest } from "next/server";
import { policySchema } from "@/schemas/setup";
import { updatePolicies } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";
import { superAdminGuard } from "@/server/admin/superGuard";

export async function PATCH(req: NextRequest) {
    try {
        const user = await superAdminGuard(req, true);
        const parsed = policySchema.parse(await readJson(req));
        await updatePolicies(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/legal", "page");
        revalidatePath("/account", "page");
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}