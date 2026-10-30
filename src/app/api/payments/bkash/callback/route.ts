// bKash sends the customer's browser here. Nothing in the URL is trusted:
// the payment is looked up by its bKash ID and CONFIRMED by asking bKash directly.
import { NextResponse, type NextRequest } from "next/server";
import { BookingModel, PaymentModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { clientIp } from "@/server/http";
import { settlePayment, type Hint } from "@/server/payments/settle";
import { rateLimitAsync } from "@/server/security/rateLimit";

function go(req: NextRequest, path: string, search = "") {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = search;
    return NextResponse.redirect(url, 303);
}

export async function GET(req: NextRequest) {
    try {
        if (!(await rateLimitAsync(`bkcb:${clientIp(req)}`, 30, 60_000))) return go(req, "/book");

        const sp = req.nextUrl.searchParams;
        const paymentId = sp.get("paymentID") ?? "";
        if (!/^[\w-]{6,80}$/.test(paymentId)) return go(req, "/book");

        await connectDb();
        const p = await PaymentModel.findOne(
            { provider: "BKASH", providerPaymentId: paymentId },
            { id: 1, bookingId: 1 }
        ).lean<{ id: string; bookingId: string }>();
        if (!p) return go(req, "/book");

        // Only bKash's three known values change behaviour. Anything else is treated as "just check".
        const status = sp.get("status");
        const hint: Hint = status === "success" ? "success" : status === "cancel" ? "cancel" : status === "failure" ? "failure" : "reconcile";

        await settlePayment(p.id, hint); // duplicate callbacks return the recorded result

        const b = await BookingModel.findOne({ id: p.bookingId }, { bookingCode: 1 }).lean<{ bookingCode: string }>();
        return b ? go(req, "/book", `?booking=${b.bookingCode}`) : go(req, "/book");
    } catch (e) {
        console.error("[bkash callback]", e instanceof Error ? e.message : "unknown error");
        return go(req, "/book");
    }
}