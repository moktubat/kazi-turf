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

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(identifier: string): Promise<{ sent: boolean }> {
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

    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(Date.now() + TTL_MS);

    await ResetTokenModel.create({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        createdAt: new Date(),
    });

    const baseUrl = process.env.AUTH_URL?.replace(/\/+$/, "");
    const resetUrl = `${baseUrl}/login?reset=${token}`;

    // Sent after the response (same timing for every identifier, so it reveals nothing).
    const to = user.email;
    runAfterResponse("reset email", () => sendResetEmail(to, user.name, resetUrl));

    return { sent: true };
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

async function sendResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
    const tpl = passwordResetEmailTemplate({ name, resetUrl });
    await sendEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
}