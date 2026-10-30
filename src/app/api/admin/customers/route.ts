import type { NextRequest } from "next/server";
import { customerLookupSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { findCustomerName } from "@/server/admin/walkin";
import { handleError, ok } from "@/server/http";

export async function GET(req: NextRequest) {
    try {
        await staffGuard(req, false);
        const q = customerLookupSchema.parse({ phone: req.nextUrl.searchParams.get("phone") ?? undefined });
        const name = await findCustomerName(q.phone);
        return ok({ customer: name ? { name } : null });
    } catch (e) {
        return handleError(e);
    }
}