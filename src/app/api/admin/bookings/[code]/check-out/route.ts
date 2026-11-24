import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { checkOut } from "@/server/admin/operations";
import { handleError, ok } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

// Check out: the game is over and the money is settled. Any remaining balance is
// collected in cash in the same action; the booking becomes COMPLETED ("Checked out")
// and its slots stay on the board. No body needed.
export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        return ok({ booking: await checkOut(user, code) });
    } catch (e) {
        return handleError(e);
    }
}