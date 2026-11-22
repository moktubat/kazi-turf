import { formatBDT, formatDateLong, formatTime12 } from "@/lib/format";

const shell = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#e8f3ee;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#013220;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(1,50,32,0.08);">
        <tr><td style="background:#013220;padding:20px 24px;">
          <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;">
            Kazi <span style="color:#50c878;">Sports Arena</span>
          </p>
        </td></tr>
        <tr><td style="padding:28px 24px;">
          ${body}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e8f3ee;">
          <p style="margin:0;font-size:12px;color:#6b7280;">
            Kazi Sports Arena · Shabgram, Bogura · Open 24/7
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

export function inquiryEmailTemplate(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  sport: string;
  subject: string;
  message: string;
}): { subject: string; html: string; text: string } {
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const subject = `New inquiry: ${input.subject}`;
  const body = `
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;">New website inquiry</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Subject: ${escapeHtml(input.subject)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:80px;vertical-align:top;">Name</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(fullName)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Email</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(input.email)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Phone</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(input.phone)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Sport</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(input.sport)}</td></tr>
      </table>
      <p style="margin:16px 0 6px;color:#6b7280;font-size:13px;">Message</p>
      <p style="margin:0;padding:12px 14px;background:#f3f9f6;border-radius:10px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(input.message)}</p>`;
  const text = `New inquiry\n\nName: ${fullName}\nEmail: ${input.email}\nPhone: ${input.phone}\nSport: ${input.sport}\nSubject: ${input.subject}\n\nMessage:\n${input.message}`;
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
  /** Counter discount in taka, if any (walk-ins). */
  discount?: number;
  /** Additional charge in taka added to the total, if any (walk-ins). */
  additionalCharge?: number;
  additionalChargeReason?: string | null;
  advance: number;
  balance: number;
}): { subject: string; html: string; text: string } {
  const discount = input.discount && input.discount > 0 ? input.discount : 0;
  const charge = input.additionalCharge && input.additionalCharge > 0 ? input.additionalCharge : 0;
  const chargeLabel = `Additional charge${input.additionalChargeReason ? ` (${input.additionalChargeReason})` : ""}`;
  const when = `${formatDateLong(input.date)}, ${formatTime12(input.start)}–${formatTime12(input.end)}`;
  const subject = `Booking confirmed — ${input.code}`;
  const body = `
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;">Your booking is confirmed</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Show this code at the venue to check in.</p>
      <p style="margin:0 0 20px;font-size:28px;font-weight:800;letter-spacing:2px;color:#0b6e4f;font-family:ui-monospace,monospace;">${input.code}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tr><td style="padding:7px 0;color:#6b7280;width:110px;">Field</td><td style="padding:7px 0;font-weight:600;">${escapeHtml(input.pitchName)} · ${escapeHtml(input.sport)}</td></tr>
        <tr><td style="padding:7px 0;color:#6b7280;">When</td><td style="padding:7px 0;font-weight:600;">${when}</td></tr>
        ${discount ? `<tr><td style="padding:7px 0;color:#6b7280;">Discount</td><td style="padding:7px 0;font-weight:600;">−${formatBDT(discount)}</td></tr>` : ""}
        ${charge ? `<tr><td style="padding:7px 0;color:#6b7280;">${escapeHtml(chargeLabel)}</td><td style="padding:7px 0;font-weight:600;">+${formatBDT(charge)}</td></tr>` : ""}
        <tr><td style="padding:7px 0;color:#6b7280;">Total</td><td style="padding:7px 0;font-weight:600;">${formatBDT(input.total)}</td></tr>
        <tr><td style="padding:7px 0;color:#6b7280;">Advance paid</td><td style="padding:7px 0;font-weight:600;">${formatBDT(input.advance)}</td></tr>
        <tr><td style="padding:7px 0;color:#6b7280;">Balance at venue</td><td style="padding:7px 0;font-weight:700;color:#92400e;">${formatBDT(input.balance)}</td></tr>
      </table>
      <p style="margin:24px 0 0;padding:12px 14px;background:#fef3c7;border-radius:10px;font-size:13px;color:#92400e;">
        Arrive early. Check-in opens 30 minutes before your slot starts.
      </p>`;
  const text = `Booking confirmed: ${input.code}\n\nField: ${input.pitchName} (${input.sport})\nWhen: ${when}${discount ? `\nDiscount: −${formatBDT(discount)}` : ""}${charge ? `\n${chargeLabel}: +${formatBDT(charge)}` : ""}\nTotal: ${formatBDT(input.total)}\nAdvance paid: ${formatBDT(input.advance)}\nBalance at venue: ${formatBDT(input.balance)}\n\nShow this code at the venue.`;
  return { subject, html: shell(subject, body), text };
}

export function passwordResetEmailTemplate(input: { name: string; resetUrl: string }): { subject: string; html: string; text: string } {
  const subject = "Reset your Kazi Sports Arena password";
  const body = `
        <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;">Reset your password</h2>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Hi ${escapeHtml(input.name)},</p>
        <p style="margin:0 0 16px;font-size:14px;">We received a request to reset your Kazi Sports Arena password. Click the button below to choose a new one. This link expires in 15 minutes.</p>
        <p style="margin:24px 0;">
            <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#0b6e4f;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Reset password</a>
        </p>
        <p style="margin:0;font-size:13px;color:#6b7280;">If you didn't request this, you can safely ignore this email.</p>`;
  const text = `Reset your Kazi Sports Arena password\n\nHi ${input.name},\n\nWe received a request to reset your password. Open this link in your browser to choose a new one (expires in 15 minutes):\n\n${input.resetUrl}\n\nIf you didn't request this, ignore this email.`;
  return { subject, html: shell(subject, body), text };
}

export function verificationCodeTemplate(input: {
  code: string;
  purpose: "REGISTER" | "EMAIL_CHANGE";
  minutes: number;
}): { subject: string; html: string; text: string } {
  const why =
    input.purpose === "REGISTER"
      ? "Use this code to finish creating your Kazi Sports Arena account."
      : "Use this code to confirm this as the new email for your Kazi Sports Arena account.";
  const subject = `${input.code} is your Kazi Sports Arena verification code`;
  const body = `
        <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;">Your verification code</h2>
        <p style="margin:0 0 16px;font-size:14px;">${why}</p>
        <p style="margin:0 0 20px;font-size:32px;font-weight:800;letter-spacing:6px;color:#0b6e4f;font-family:ui-monospace,monospace;">${escapeHtml(input.code)}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">The code expires in ${input.minutes} minutes. Never share it with anyone, including venue staff.</p>
        <p style="margin:0;font-size:13px;color:#6b7280;">If you didn't ask for this, you can safely ignore this email.</p>`;
  const text = `Your Kazi Sports Arena verification code: ${input.code}\n\n${why}\nThe code expires in ${input.minutes} minutes. Never share it with anyone.\n\nIf you didn't ask for this, ignore this email.`;
  return { subject, html: shell(subject, body), text };
}

/**
 * Sent instead of a sign-up code when the email already has an account, so the sign-up form
 * answers the same way for new and existing emails (no account enumeration). No code inside.
 */
export function accountExistsTemplate(input: { signInUrl: string }): { subject: string; html: string; text: string } {
  const subject = "You already have a Kazi Sports Arena account";
  const body = `
        <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;">You already have an account</h2>
        <p style="margin:0 0 16px;font-size:14px;">Someone tried to create a new Kazi Sports Arena account with this email, but an account using it already exists, so no new account was made.</p>
        <p style="margin:0 0 20px;font-size:14px;"><a href="${escapeHtml(input.signInUrl)}" style="color:#0b6e4f;font-weight:700;">Sign in</a>, or use "Forgot password?" on the sign-in page if you can't remember your password.</p>
        <p style="margin:0;font-size:13px;color:#6b7280;">If this wasn't you, you can safely ignore this email. Your account has not changed.</p>`;
  const text = `You already have a Kazi Sports Arena account.\n\nSomeone tried to create a new account with this email, but one already exists, so no new account was made.\nSign in: ${input.signInUrl}\nForgot your password? Use "Forgot password?" on the sign-in page.\n\nIf this wasn't you, ignore this email. Your account has not changed.`;
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