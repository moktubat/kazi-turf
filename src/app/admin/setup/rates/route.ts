import type { NextRequest } from "next/server";
import { rateDeleteSchema, rateSchema, rateUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createRate, deleteRate, updateRate } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";

export async function POST(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/rates] POST START (create)");
    try {
        const user = await staffGuard(req, true);
        console.log("[setup/rates] staffGuard done:", Date.now() - start, "ms");

        const body = await readJson(req);
        console.log("[setup/rates] body:", JSON.stringify(body, null, 2));
        const parsed = rateSchema.parse(body);

        console.log("[setup/rates] createRate...");
        await createRate(user, parsed);
        console.log("[setup/rates] SUCCESS:", Date.now() - start, "ms");
        return ok({ saved: true }, 201);
    } catch (e) {
        console.error("[setup/rates] ERROR:", e instanceof Error ? e.message : e);
        console.error("[setup/rates] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/rates] PATCH START (update)");
    try {
        const user = await staffGuard(req, true);
        const body = await readJson(req);
        console.log("[setup/rates] body:", JSON.stringify(body, null, 2));
        const parsed = rateUpdateSchema.parse(body);

        console.log("[setup/rates] updateRate...");
        await updateRate(user, parsed);
        console.log("[setup/rates] SUCCESS:", Date.now() - start, "ms");
        return ok({ saved: true });
    } catch (e) {
        console.error("[setup/rates] ERROR:", e instanceof Error ? e.message : e);
        console.error("[setup/rates] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}

export async function DELETE(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/rates] DELETE START");
    try {
        const user = await staffGuard(req, true);
        const body = await readJson(req);
        console.log("[setup/rates] body:", JSON.stringify(body, null, 2));
        const parsed = rateDeleteSchema.parse(body);

        console.log("[setup/rates] deleteRate...");
        await deleteRate(user, parsed.id);
        console.log("[setup/rates] SUCCESS:", Date.now() - start, "ms");
        return ok({ deleted: true });
    } catch (e) {
        console.error("[setup/rates] ERROR:", e instanceof Error ? e.message : e);
        console.error("[setup/rates] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}