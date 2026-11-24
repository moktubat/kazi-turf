import { connection, type NextRequest } from "next/server";
import { bookingSearchSchema, walkInSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { searchBookingsPage } from "@/server/admin/search";
import { createWalkIn } from "@/server/admin/walkin";
import { handleError, ok, readJson } from "@/server/http";

// Search and filter (branch scope enforced inside). Numbered pagination: 25 rows per
// page (?page=2), with the total count and last page in the response.
export async function GET(req: NextRequest) {
    await connection();
    try {
        const user = await staffGuard(req, false);
        const q = bookingSearchSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        return ok(
            await searchBookingsPage(user, {
                ...q,
                limit: q.limit ? Number(q.limit) : undefined,
                page: q.page ? Number(q.page) : undefined,
            })
        );
    } catch (e) {
        return handleError(e);
    }
}

// Walk-in booking.
export async function POST(req: NextRequest) {
    await connection();
    try {
        const user = await staffGuard(req, true);
        const input = walkInSchema.parse(await readJson(req));
        return ok({ booking: await createWalkIn(user, input) }, 201);
    } catch (e) {
        return handleError(e);
    }
}