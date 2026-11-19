import type { NextRequest } from "next/server";
import { discountUpdateSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { updateDiscount } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

type Ctx = { params: Promise<{ code: string }> };

// Add or change the counter discount on an existing booking (Booked or Checked in).
// The discount recalculates VAT, total, balance and payment status server-side.
export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        const user = await staffGuard(req, true);
        const { code } = await params;
        const input = discountUpdateSchema.parse(await readJson(req));
        return ok({ booking: await updateDiscount(user, code, input.discount ?? null) });
    } catch (e) {
        return handleError(e);
    }
}