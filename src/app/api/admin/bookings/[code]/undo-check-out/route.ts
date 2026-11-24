import type { NextRequest } from "next/server";
import { undoCheckOutSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { undoCheckOut } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

// Undo a check-out: the booking goes back to Checked in (or Booked, when it was never
// checked in). Money already collected stays collected; it can be checked out again.
export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        const input = undoCheckOutSchema.parse(await readJson(req));
        return ok({ booking: await undoCheckOut(user, code, input.reason) });
    } catch (e) {
        return handleError(e);
    }
}