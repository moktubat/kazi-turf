import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { adjustmentDeleteSchema, adjustmentSchema, adjustmentUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createAdjustment, deleteAdjustment, updateAdjustment } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";

// Seasonal pricing (date-range price increase / reduction). Same access as slot
// prices: Super Admin, or Staff with the pitches.edit permission for the venue.
function revalidate() {
    revalidatePath("/admin/setup", "page");
    revalidatePath("/", "page");
    revalidatePath("/book", "page");
}

export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await createAdjustment(user, adjustmentSchema.parse(await readJson(req)));
        revalidate();
        return ok({ saved: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await updateAdjustment(user, adjustmentUpdateSchema.parse(await readJson(req)));
        revalidate();
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await deleteAdjustment(user, adjustmentDeleteSchema.parse(await readJson(req)).id);
        revalidate();
        return ok({ deleted: true });
    } catch (e) {
        return handleError(e);
    }
}
