import type { NextRequest } from "next/server";
import { pitchSchema, pitchUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createPitch, updatePitch } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        const parsed = pitchSchema.parse(await readJson(req));
        await createPitch(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        return ok({ saved: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        const parsed = pitchUpdateSchema.parse(await readJson(req));
        await updatePitch(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}