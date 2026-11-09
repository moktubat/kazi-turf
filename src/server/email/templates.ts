import { formatBDT, formatDateLong, formatTime12 } from "@/lib/format";

const shell = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#e8f3ee;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#013220;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(1,50,32,0.08);">
        <tr><td style="background:#013220;padding:20px 24px;">
          <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;">
            Kazi<span style="color:#50c878;">Turf</span>
          </p>
        </td></tr>
        <tr><td style="padding:28px 24px;">
          ${body}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e8f3ee;">
          <p style="margin:0;font-size:12px;color:#6b7280;">
            KaziTurf — Turf &amp; Sports Court Booking
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

export function inquiryEmailTemplate(input: {
    name: string;
    contact: string;
    message: string;
}): { subject: string; html: string; text: string } {
    const subject = `New inquiry from ${input.name}`;
    const body = `
      <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;">New website inquiry</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:80px;vertical-align:top;">Name</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(input.name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Contact</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(input.contact)}</td></tr>
      </table>
      <p style="margin:16px 0 6px;color:#6b7280;font-size:13px;">Message</p>
      <p style="margin:0;padding:12px 14px;background:#f3f9f6;border-radius:10px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(input.message)}</p>`;
    const text = `New inquiry\n\nName: ${input.name}\nContact: ${input.contact}\n\nMessage:\n${input.message}`;
    return { subject, html: shell(subject, body), text };
}

export function bookingConfirmationTemplate(input: {
    name: string;
    code: string;
    pitchName: string;
    sport: string;
    date: string;
    start: string;
    end: string;
    total: number;
    advance: number;
    balance: number;
}): { subject: string; html: string; text: string } {
    const when = `${formatDateLong(input.date)}, ${formatTime12(input.start)}–${formatTime12(input.end)}`;
    const subject = `Booking confirmed — ${input.code}`;
    const body = `
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;">Your booking is confirmed</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Show this code at the venue to check in.</p>
      <p style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:2px;color:#0b6e4f;font-family:ui-monospace,monospace;">${input.code}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tr><td style="padding:7px 0;color:#6b7280;width:110px;">Field</td><td style="padding:7px 0;font-weight:600;">${escapeHtml(input.pitchName)} · ${escapeHtml(input.sport)}</td></tr>
        <tr><td style="padding:7px 0;color:#6b7280;">When</td><td style="padding:7px 0;font-weight:600;">${when}</td></tr>
        <tr><td style="padding:7px 0;color:#6b7280;">Total</td><td style="padding:7px 0;font-weight:600;">${formatBDT(input.total)}</td></tr>
        <tr><td style="padding:7px 0;color:#6b7280;">Advance paid</td><td style="padding:7px 0;font-weight:600;">${formatBDT(input.advance)}</td></tr>
        <tr><td style="padding:7px 0;color:#6b7280;">Balance at venue</td><td style="padding:7px 0;font-weight:700;color:#92400e;">${formatBDT(input.balance)}</td></tr>
      </table>
      <p style="margin:24px 0 0;padding:12px 14px;background:#fef3c7;border-radius:10px;font-size:13px;color:#92400e;">
        Arrive early. Check-in opens 30 minutes before your slot starts.
      </p>`;
    const text = `Booking confirmed: ${input.code}\n\nField: ${input.pitchName} (${input.sport})\nWhen: ${when}\nTotal: ${formatBDT(input.total)}\nAdvance paid: ${formatBDT(input.advance)}\nBalance at venue: ${formatBDT(input.balance)}\n\nShow this code at the venue.`;
    return { subject, html: shell(subject, body), text };
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}