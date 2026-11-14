import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bookingSearchSchema } from "@/schemas/admin";
import { bookingsCsv } from "@/server/admin/search";
import { handleError } from "@/server/http";
import { superAdminGuard } from "@/server/admin/superGuard";

// Super Admin only (checked inside bookingsCsv).
export async function GET(req: NextRequest) {
    try {
        const user = await superAdminGuard(req, false);
        const q = bookingSearchSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        const csv = await bookingsCsv(user, { ...q, limit: undefined });
        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": 'attachment; filename="kaziturf-bookings.csv"',
                "Cache-Control": "no-store",
            },
        });
    } catch (e) {
        return handleError(e);
    }
}