// bKash sends the customer's browser here. Nothing in the URL is trusted:
// the payment is looked up by its bKash ID and CONFIRMED by asking bKash directly.
import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/server/http";
import { settlePayment, type Hint } from "@/server/payments/settle";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { store } from "@/server/store";

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

        const p = store.payments.find((x) => x.provider === "BKASH" && x.providerPaymentId === paymentId);
        if (!p) return go(req, "/book");

        // Only bKash's three known values change behaviour. Anything else is treated as "just check".
        const status = sp.get("status");
        const hint: Hint = status === "success" ? "success" : status === "cancel" ? "cancel" : status === "failure" ? "failure" : "reconcile";

        await settlePayment(p.id, hint); // duplicate callbacks return the recorded result

        const b = store.bookings.find((x) => x.id === p.bookingId);
        return b ? go(req, "/book", `?booking=${b.bookingCode}`) : go(req, "/book");
    } catch (e) {
        console.error("[bkash callback]", e instanceof Error ? e.message : "unknown error");
        return go(req, "/book");
    }
}