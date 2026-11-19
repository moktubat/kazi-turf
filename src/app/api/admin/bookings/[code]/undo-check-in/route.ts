import type { NextRequest } from "next/server";
import { undoCheckInSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { undoCheckIn } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

// Undo a check-in: the booking goes back to Booked (CONFIRMED). Money already
// collected stays collected; the booking can be checked in again afterwards.
export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        const input = undoCheckInSchema.parse(await readJson(req));
        return ok({ booking: await undoCheckIn(user, code, input.reason) });
    } catch (e) {
        return handleError(e);
    }
}