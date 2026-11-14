import "server-only";
import { createHash, randomBytes } from "crypto";
import { ResetTokenModel, UserModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { AppError } from "@/server/http";
import { hashPassword } from "@/server/auth/password";
import { endOtherSessions } from "@/server/auth/session";
import { logAudit } from "@/server/audit";

const TTL_MS = 15 * 60_000; // 15 minutes
const TOKEN_BYTES = 32;

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(identifier: string): Promise<{ sent: boolean }> {
    await connectDb();
    // Look up the user by email or phone. Do NOT reveal whether the account exists.
    const isEmail = identifier.includes("@");
    const user = await UserModel.findOne(
        isEmail ? { email: identifier.toLowerCase() } : { phone: identifier }
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

    // Send the email — non-blocking.
    void sendResetEmail(user.email, user.name, resetUrl).catch((e) => {
        console.error("[reset] email send failed:", e instanceof Error ? e.message : e);
    });

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