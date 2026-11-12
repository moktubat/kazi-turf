import type { NextRequest } from "next/server";
import { staffCreateSchema, staffUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createStaff, updateStaff } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/staff] POST START (create)");
    try {
        const user = await staffGuard(req, true);
        console.log("[setup/staff] staffGuard done:", Date.now() - start, "ms");

        const body = (await readJson(req)) as Record<string, unknown>;
        console.log("[setup/staff] body:", { ...body, password: body.password ? "[REDACTED]" : undefined });
        const parsed = staffCreateSchema.parse(body);

        console.log("[setup/staff] createStaff...");
        await createStaff(user, parsed);
        revalidatePath("/admin/setup", "page");
        console.log("[setup/staff] SUCCESS:", Date.now() - start, "ms");
        return ok({ saved: true }, 201);
    } catch (e) {
        console.error("[setup/staff] ERROR:", e instanceof Error ? e.message : e);
        console.error("[setup/staff] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/staff] PATCH START (update)");
    try {
        const user = await staffGuard(req, true);
        const body = (await readJson(req)) as Record<string, unknown>;
        console.log("[setup/staff] body:", { ...body, newPassword: body.newPassword ? "[REDACTED]" : undefined });
        const parsed = staffUpdateSchema.parse(body);

        console.log("[setup/staff] updateStaff...");
        await updateStaff(user, parsed);
        revalidatePath("/admin/setup", "page");
        console.log("[setup/staff] SUCCESS:", Date.now() - start, "ms");
        return ok({ saved: true });
    } catch (e) {
        console.error("[setup/staff] ERROR:", e instanceof Error ? e.message : e);
        console.error("[setup/staff] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}