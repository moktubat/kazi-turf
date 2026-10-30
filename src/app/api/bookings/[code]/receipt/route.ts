// Built from trusted server data. Same generator as the staff print view (lib/printReceipt).
import { NextResponse, type NextRequest } from "next/server";
import { hasVerifiedPayment, receiptHtml } from "@/lib/printReceipt";
import { toAdminDto } from "@/server/admin/dto";
import { canAccessBranch, requireUser } from "@/server/auth/guards";
import { findBookingByCode } from "@/server/bookings";
import { AppError, handleError } from "@/server/http";
import { rateLimit } from "@/server/security/rateLimit";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
    try {
        const user = await requireUser();
        if (!rateLimit(`receipt:${user.id}`, 30, 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
        }

        const { code } = await params;
        const b = await findBookingByCode(code);
        // Owner, staff of that branch, or Super Admin. Same "not found" for everyone else.
        if (!b || !(b.customerId === user.id || canAccessBranch(user, b.branchId))) {
            throw new AppError("NOT_FOUND", "Booking not found.", 404);
        }

        const dto = await toAdminDto(b, user);
        // A pending, failed or refunded payment never produces a "paid" receipt.
        if (!["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(dto.bookingStatus) || !hasVerifiedPayment(dto)) {
            throw new AppError("NO_RECEIPT", "A receipt is available once your payment is verified.", 409);
        }

        const inline = req.nextUrl.searchParams.get("view") === "1";
        return new NextResponse(receiptHtml(dto), {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="KaziTurf-${code}.html"`,
                "Cache-Control": "private, no-store",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (e) {
        return handleError(e);
    }
}