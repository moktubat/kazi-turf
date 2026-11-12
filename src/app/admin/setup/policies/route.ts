import type { NextRequest } from "next/server";
import { policySchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { updatePolicies } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";

export async function PATCH(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/policies] PATCH START");
    try {
        const user = await staffGuard(req, true);
        console.log("[setup/policies] staffGuard done:", Date.now() - start, "ms");

        const body = await readJson(req);
        console.log("[setup/policies] body:", JSON.stringify(body, null, 2));
        const parsed = policySchema.parse(body);

        console.log("[setup/policies] updatePolicies...");
        await updatePolicies(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/legal", "page");
        revalidatePath("/account", "page");
        return ok({ saved: true });

    } catch (e) {
        console.error("[setup/policies] ERROR:", e instanceof Error ? e.message : e);
        console.error("[setup/policies] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}