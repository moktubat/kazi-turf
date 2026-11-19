import type { NextRequest } from "next/server";
import { noteUpdateSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { updateNote } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

// Add or change (or clear, with note: null) the staff note on an existing booking.
export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        const input = noteUpdateSchema.parse(await readJson(req));
        return ok({ booking: await updateNote(user, code, input.note ?? null) });
    } catch (e) {
        return handleError(e);
    }
}