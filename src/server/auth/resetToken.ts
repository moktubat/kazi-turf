import "server-only";
import { createHash, randomBytes } from "crypto";
import { ResetTokenModel, UserModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { AppError } from "@/server/http";
import { assertPasswordPolicy, hashPassword } from "@/server/auth/password";
import { endOtherSessions } from "@/server/auth/session";
import { logAudit } from "@/server/audit";
import { parseIdentifier } from "@/server/auth/users";
import { runAfterResponse } from "@/server/background";

const TTL_MS = 15 * 60_000; // 15 minutes
const TOKEN_BYTES = 32;

const PROD = process.env.NODE_ENV === "production";
/** Holds the reset token between the email link (/api/auth/reset-link) and the reset form. */
export const RESET_COOKIE = PROD ? "__Host-kt_reset" : "kt_reset";
/** base64url of TOKEN_BYTES random bytes (43 chars); same bounds the reset API accepts. */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

export function resetCookieOptions(maxAgeSeconds = TTL_MS / 1000) {
    return { httpOnly: true, sameSite: "lax" as const, secure: PROD, path: "/", maxAge: maxAgeSeconds };
}

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** One reset email per account per minute: a double tap or a quick retry reuses the link already on its way. */
export const RESET_COOLDOWN_MS = 60_000;

export async function requestPasswordReset(identifier: string, now: Date = new Date()): Promise<{ sent: boolean }> {
    const t0 = performance.now();
    await connectDb();
    // Look up the user by email or phone. Do NOT reveal whether the account exists.
    // Same canonical form as login: "+8801…" / "0171-…" find the same account as "01…".
    const id = parseIdentifier(identifier);
    const user = await UserModel.findOne(
        id.kind === "email" ? { email: id.value } : { phone: id.value }
    ).lean<{ id: string; email: string | null; name: string } | null>();

    if (!user?.email) {
        // Account doesn't exist or has no email — return success to avoid enumeration.
        return { sent: true };
    }

    // Everything else (the token writes AND the email) runs after the response, through
    // Next's after(): the platform keeps the function alive until it finishes, so nothing
    // is cut off on serverless. The response therefore costs the same single lookup whether
    // or not the account exists, so its timing reveals nothing either.
    const to = user.email;
    const userId = user.id;
    const name = user.name;
    runAfterResponse("password reset email", () => issueAndSendReset(userId, to, name, now, t0));
    return { sent: true };
}

async function issueAndSendReset(userId: string, to: string, name: string, now: Date, t0: number): Promise<void> {
    const queuedMs = Math.round(performance.now() - t0);
    const recent = { userId, createdAt: { $gt: new Date(now.getTime() - RESET_COOLDOWN_MS), $lte: now } };
    if (await ResetTokenModel.exists(recent)) {
        console.info(JSON.stringify({ at: new Date().toISOString(), evt: "reset.deduplicated", flow: "password_reset", reason: "link sent in the last minute" }));
        return;
    }

    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const recordId = crypto.randomUUID();
    await ResetTokenModel.create({
        id: recordId,
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + TTL_MS),
        createdAt: now,
    });

    // Two requests at the same moment both passed the check above: only the earliest sends.
    const earlier = { $or: [{ createdAt: { $lt: now } }, { createdAt: now, id: { $lt: recordId } }] };
    if (await ResetTokenModel.exists({ ...recent, id: { $ne: recordId }, ...earlier })) {
        await ResetTokenModel.deleteOne({ id: recordId });
        console.info(JSON.stringify({ at: new Date().toISOString(), evt: "reset.deduplicated", flow: "password_reset", reason: "concurrent request" }));
        return;
    }
    // Only the newest link works: OLDER unused links are retired (never a newer one).
    await ResetTokenModel.updateMany({ userId, usedAt: null, id: { $ne: recordId }, ...earlier }, { $set: { usedAt: now } });

    const baseUrl = process.env.AUTH_URL?.replace(/\/+$/, "");
    // Not /login?reset=…: that page loads analytics, which would record the live token.
    const resetUrl = `${baseUrl}/api/auth/reset-link?reset=${token}`;
    const tpl = passwordResetEmailTemplate({ name, resetUrl });
    const appMs = Math.round(performance.now() - t0);
    const result = await sendEmail(
        { to, subject: tpl.subject, html: tpl.html, text: tpl.text },
        { flow: "password_reset", idempotencyKey: `reset-${recordId}` }
    );
    console.info(JSON.stringify({ at: new Date().toISOString(), evt: "reset.issued", flow: "password_reset", queuedMs, appMs, totalMs: Math.round(performance.now() - t0), accepted: !!result.id, attempts: result.attempts ?? 0 }));
    if (!result.id) {
        // Not accepted after the retries: withdraw the link, so the cooldown does not stop
        // the person from asking again straight away.
        await ResetTokenModel.deleteOne({ id: recordId });
    }
}

export async function consumePasswordReset(token: string, newPassword: string): Promise<void> {
    await connectDb();
    const record = await ResetTokenModel.findOne({
        tokenHash: hashToken(token),
        expiresAt: { $gt: new Date() },
        usedAt: null,
    }).lean<{ id: string; userId: string } | null>();

    if (!record) {
        throw new AppError("RESET_TOKEN_INVALID", "This reset link is invalid or expired.", 400);
    }

    // Staff and Super Admin keep their stricter policy on reset too. Checked before the
    // token is used, so a rejected password doesn't burn the link.
    const owner = await UserModel.findOne({ id: record.userId }, { role: 1 }).lean<{ role: string } | null>();
    if (!owner) throw new AppError("RESET_TOKEN_INVALID", "This reset link is invalid or expired.", 400);
    assertPasswordPolicy(owner.role, newPassword);

    // Mark as used FIRST (atomic) so concurrent use is rejected.
    const r = await ResetTokenModel.updateOne(
        { id: record.id, usedAt: null },
        { $set: { usedAt: new Date() } }
    );
    if (r.modifiedCount === 0) {
        throw new AppError("RESET_TOKEN_USED", "This reset link has already been used.", 409);
    }

    const passwordHash = await hashPassword(newPassword);
    await UserModel.updateOne({ id: record.userId }, { $set: { passwordHash } });
    // Any other outstanding link for this account dies with the reset.
    await ResetTokenModel.updateMany({ userId: record.userId, usedAt: null }, { $set: { usedAt: new Date() } });

    // Sign out all sessions for this user (the password change invalidates old sessions).
    await endOtherSessions(record.userId);

    await logAudit(
        { id: record.userId, name: "user" },
        { action: "PASSWORD_RESET", entityType: "USER", entityId: record.userId }
    );
}

// Local import to avoid a circular dependency at module load.
import { sendEmail } from "@/server/email";
import { passwordResetEmailTemplate } from "@/server/email/templates";
