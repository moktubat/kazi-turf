import type { NextRequest } from "next/server";
import { inquiryHandleSchema } from "@/schemas/setup";
import { markInquiryHandled } from "@/server/admin/insights";
import { handleError, ok, readJson } from "@/server/http";
import { superAdminGuard } from "@/server/admin/superGuard";

// Super Admin only (checked inside markInquiryHandled).
export async function POST(req: NextRequest) {
    try {
        const user = await superAdminGuard(req, true);
        await markInquiryHandled(
            user,
            inquiryHandleSchema.parse(await readJson(req)).id
        );
        return ok({ handled: true });
    } catch (e) {
        return handleError(e);
    }
}