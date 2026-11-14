import type { NextRequest } from "next/server";
import { rateDeleteSchema, rateSchema, rateUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createRate, deleteRate, updateRate } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        const parsed = rateSchema.parse(await readJson(req));
        await createRate(user, parsed);
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
        const parsed = rateUpdateSchema.parse(await readJson(req));
        await updateRate(user, parsed);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        const parsed = rateDeleteSchema.parse(await readJson(req));
        await deleteRate(user, parsed.id);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        return ok({ deleted: true });
    } catch (e) {
        return handleError(e);
    }
}