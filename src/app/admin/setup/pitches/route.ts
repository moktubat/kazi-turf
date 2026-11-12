import type { NextRequest } from "next/server";
import { pitchSchema, pitchUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createPitch, updatePitch } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/pitches] POST START (create)");
    try {
        console.log("[setup/pitches] step 1: staffGuard");
        const user = await staffGuard(req, true);
        console.log("[setup/pitches] step 1 done:", Date.now() - start, "ms");

        console.log("[setup/pitches] step 2: readJson + validate");
        const body = await readJson(req);
        console.log("[setup/pitches] body:", JSON.stringify(body, null, 2));
        const parsed = pitchSchema.parse(body);
        console.log("[setup/pitches] step 2 done:", Date.now() - start, "ms");

        console.log("[setup/pitches] step 3: createPitch");
        await createPitch(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        console.log("[setup/pitches] step 3 done:", Date.now() - start, "ms");

        console.log("[setup/pitches] SUCCESS");
        return ok({ saved: true }, 201);
    } catch (e) {
        console.error("[setup/pitches] ERROR:", Date.now() - start, "ms");
        console.error("[setup/pitches] error:", e instanceof Error ? e.message : e);
        console.error("[setup/pitches] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    const start = Date.now();
    console.log("[setup/pitches] PATCH START (update)");
    try {
        console.log("[setup/pitches] step 1: staffGuard");
        const user = await staffGuard(req, true);
        console.log("[setup/pitches] step 1 done:", Date.now() - start, "ms");

        console.log("[setup/pitches] step 2: readJson + validate");
        const body = await readJson(req);
        console.log("[setup/pitches] body:", JSON.stringify(body, null, 2));
        const parsed = pitchUpdateSchema.parse(body);
        console.log("[setup/pitches] step 2 done:", Date.now() - start, "ms");

        console.log("[setup/pitches] step 3: updatePitch");
        await updatePitch(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        console.log("[setup/pitches] step 3 done:", Date.now() - start, "ms");

        console.log("[setup/pitches] SUCCESS");
        return ok({ saved: true });
    } catch (e) {
        console.error("[setup/pitches] ERROR:", Date.now() - start, "ms");
        console.error("[setup/pitches] error:", e instanceof Error ? e.message : e);
        console.error("[setup/pitches] stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}