import type { NextRequest } from "next/server";
import { chargeUpdateSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { updateAdditionalCharge } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

// Add or change (or clear, with additionalCharge: null) the additional charge on an
// existing booking (Booked or Checked in) — for a charge forgotten at the counter or an
// extra service the customer takes after the slot was booked. The charge recalculates
// VAT, total, balance and payment status server-side, exactly like the walk-in form.
export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        const input = chargeUpdateSchema.parse(await readJson(req));
        return ok({ booking: await updateAdditionalCharge(user, code, input.additionalCharge ?? null) });
    } catch (e) {
        return handleError(e);
    }
}