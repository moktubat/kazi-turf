import type { NextRequest } from "next/server";
import { branchUpdateSchema } from "@/schemas/setup";
import { updateBranch } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";
import { superAdminGuard } from "@/server/admin/superGuard";

export async function PATCH(req: NextRequest) {
    try {
        const user = await superAdminGuard(req, true);
        const parsed = branchUpdateSchema.parse(await readJson(req));
        await updateBranch(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        revalidatePath("/legal", "page");
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}