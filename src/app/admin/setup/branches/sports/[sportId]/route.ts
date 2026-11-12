import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { deleteSport } from "@/server/admin/setup";
import { handleError, ok } from "@/server/http";
import { revalidatePath } from "next/cache";

type Ctx = { params: Promise<{ sportId: string }> };

// Super Admin only (assertSuperAdmin runs inside deleteSport).
// Cascade-deletes every pitch, slot claim, pricing rule and Cloudinary image
// attached to this sport, then removes the sport from the venue.
export async function DELETE(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { sportId } = await params;
        await deleteSport(user, sportId);
        revalidatePath("/admin/setup", "page");
        revalidatePath("/", "page");
        revalidatePath("/book", "page");
        return ok({ deleted: true });
    } catch (e) {
        return handleError(e);
    }
}