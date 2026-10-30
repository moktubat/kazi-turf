// Counter receipt from server-provided booking data. Everything is HTML-escaped.
// Batch 7 adds the downloadable server receipt route; this is the staff print view.
import { formatBDT, formatDateLong } from "@/lib/format";
import type { AdminBookingDto } from "@/types/admin";

const esc = (s: string | number) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function hasVerifiedPayment(b: AdminBookingDto): boolean {
    return b.payments.some((p) => p.status === "SUCCESS");
}

export function receiptHtml(b: AdminBookingDto): string {
    const ok = b.payments.filter((p) => p.status === "SUCCESS");
    const paid = ok.reduce((s, p) => s + p.amount, 0);
    const due = Math.max(0, b.total - paid);
    const row = (l: string, v: string, bold = false) =>
        `<tr${bold ? ' style="font-weight:700"' : ""}><td>${esc(l)}</td><td style="text-align:right">${esc(v)}</td></tr>`;

    const vatLabel = b.total === b.subtotal ? `Includes VAT (${b.vatRatePercent}%)` : `VAT (${b.vatRatePercent}%)`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(b.code)}</title>
<style>
body{font-family:Arial,sans-serif;max-width:340px;margin:16px auto;color:#013220;font-size:14px}
h1{font-size:20px;margin:0 0 4px}.code{font-family:monospace;font-size:22px;font-weight:700;letter-spacing:2px;margin:8px 0}
table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}hr{border:0;border-top:1px dashed #013220;margin:10px 0}
.small{font-size:12px;color:#355}
</style></head><body>
<h1>KaziTurf</h1>
<div class="small">${esc(b.branchName)}</div>
<div class="code">${esc(b.code)}</div>
<table>
${row("Customer", b.customerName)}
${row("Pitch", `${b.pitchName} (${b.sport})`)}
${row("Date", formatDateLong(b.date))}
${row("Time", `${b.start}-${b.end}`)}
</table><hr><table>
${row("Subtotal", formatBDT(b.subtotal))}
${b.vatRatePercent && b.vatAmount > 0 ? row(vatLabel, formatBDT(b.vatAmount)) : ""}
${row("Total", formatBDT(b.total), true)}
</table><hr><table>
${ok.map((p) => row(`${p.kind === "ADVANCE" ? "Advance" : "Balance"} (${p.provider === "CASH" ? "Cash" : "bKash"}${p.reference ? ` ${p.reference}` : ""})`, formatBDT(p.amount))).join("")}
${row("Balance due at venue", formatBDT(due), true)}
</table>
${b.vatRegistrationNo ? `<hr><div class="small">VAT reg. no: ${esc(b.vatRegistrationNo)}</div>` : ""}
<hr><div class="small">Show this code at the venue.</div>
</body></html>`;
}

/** Hidden-iframe print: works on phones without a popup blocker. */
export function printReceipt(b: AdminBookingDto) {
    if (!hasVerifiedPayment(b)) return; // a pending payment never produces a "paid" receipt
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) return frame.remove();
    doc.open();
    doc.write(receiptHtml(b));
    doc.close();
    setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => frame.remove(), 60_000);
    }, 150);
}