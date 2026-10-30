import { api } from "@/lib/api";

/** Starts bKash checkout for the server-calculated advance. Route ships in Batch 6. */
export async function startBkashPayment(code: string): Promise<void> {
    const r = await api<{ redirectUrl: string }>("/api/payments/bkash/create", {
        method: "POST",
        body: JSON.stringify({ code }),
    });
    window.location.assign(r.redirectUrl);
}