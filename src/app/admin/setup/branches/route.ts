import type { NextRequest } from "next/server";
import { branchUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { updateBranch } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";

export async function PATCH(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/branches] PATCH START");
    try {
        console.log("[setup/branches] step 1: staffGuard");
        const user = await staffGuard(req, true);
        console.log("[setup/branches] step 1 done:", Date.now() - start, "ms");

        console.log("[setup/branches] step 2: readJson + validate");
        const body = await readJson(req);
        console.log("[setup/branches] body:", JSON.stringify(body, null, 2));
        const parsed = branchUpdateSchema.parse(body);
        console.log("[setup/branches] step 2 done:", Date.now() - start, "ms");

        console.log("[setup/branches] step 3: updateBranch");
        await updateBranch(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        revalidatePath("/legal", "page");
        return ok({ saved: true });

    } catch (e) {
        console.error("[setup/branches] ERROR:", Date.now() - start, "ms");
        console.error("[setup/branches] error:", e instanceof Error ? e.message : e);
        console.error("[setup/branches] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}