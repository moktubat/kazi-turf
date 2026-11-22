import "server-only";
import { randomUUID } from "crypto";
import { normalizePhone } from "@/lib/phone";
import { UserModel } from "@/models";
import { logAudit } from "@/server/audit";
import { connectDb, tx } from "@/server/db/connect";
import { dupField, isDup, plain } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { SessionUser } from "@/types";
import type { User } from "@/types/user";
import { DUMMY_HASH, assertPasswordPolicy, checkPassword, hashPassword, verifyPassword } from "./password";
import { checkEmailOtp, consumeEmailOtp, issueEmailOtp, normalizeEmail } from "./emailOtp";

export function toSessionUser(u: User): SessionUser {
    return { id: u.id, name: u.name, role: u.role };
}

/** Canonical form of a login identifier: lowercased email or normalised phone. Lockout and rate limits key on this. */
export function parseIdentifier(raw: string) {
    const v = raw.trim();
    return v.includes("@")
        ? ({ kind: "email", value: v.toLowerCase() } as const)
        : ({ kind: "phone", value: normalizePhone(v) } as const);
}

export async function authenticate(identifier: string, password: string): Promise<User | null> {
    await connectDb();
    const id = parseIdentifier(identifier);
    const doc = await UserModel.findOne(id.kind === "email" ? { email: id.value } : { phone: id.value }).lean();
    const user = doc ? plain<User>(doc) : null;
    // Always verify something, so response time does not reveal whether the account exists.
    const { ok, upgraded } = await checkPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || user.status !== "ACTIVE") return null;
    // Older hash, right password: store it again with the current (stronger) parameters.
    if (upgraded) {
        await UserModel.updateOne({ id: user.id, passwordHash: user.passwordHash }, { $set: { passwordHash: upgraded } });
    }
    return user;
}

const taken = (field: string | null) =>
    field === "email"
        ? new AppError("EMAIL_TAKEN", "An account with this email already exists.", 409, { email: "Already registered. Try signing in." })
        : new AppError("PHONE_TAKEN", "An account with this phone already exists.", 409, { phone: "Already registered. Try signing in." });

/** Friendly pre-check. The unique indexes are the real guarantee (see mapDup). */
export async function assertUnique(phone: string, email: string | null, selfId?: string) {
    await connectDb();
    const self = selfId ? { id: { $ne: selfId } } : {};
    if (await UserModel.exists({ ...self, phone })) throw taken("phone");
    if (email && (await UserModel.exists({ ...self, email }))) throw taken("email");
}

export function mapDup(e: unknown): never {
    if (isDup(e)) throw taken(dupField(e));
    throw e;
}

/**
 * Sign-up step 1: email a 6-digit code. Nothing is stored about the account yet: the
 * password is only hashed in step 2.
 *
 * The answer is the same whether or not the phone or email is already registered, so the
 * form cannot be used to find out who has an account (staff included):
 *  - email already registered: the owner gets a "you already have an account" email
 *    instead of a code (same limits, cooldown and response);
 *  - phone already registered: only reported in step 2, after the email code proved the
 *    person controls a real inbox, and every such check uses up one of the code's tries.
 */
export async function startRegistration(
    input: { name: string; phone: string; email: string },
    opts: { ip?: string; now?: Date; resend?: boolean } = {}
) {
    await connectDb();
    const email = normalizeEmail(input.email);
    // Not awaited here: the lookup runs in parallel with issueEmailOtp's own checks.
    const accountExists = UserModel.exists({ email }).then((r) => !!r);
    accountExists.catch(() => {}); // if issueEmailOtp throws before awaiting it, no unhandled rejection
    // Same email again (e.g. after "Change details"): the code already sent still works.
    return issueEmailOtp({ email, purpose: "REGISTER", ip: opts.ip, now: opts.now, reuseLive: !opts.resend, accountExists });
}

/** Sign-up step 2: the code is checked first, then duplicates, then code + account commit together. */
export async function registerCustomer(
    input: { name: string; phone: string; email: string; password: string; otpCode: string },
    opts: { now?: Date } = {}
): Promise<User> {
    await connectDb();
    const now = opts.now ?? new Date();
    const phone = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);

    // Code first: "phone already registered" is only ever told to someone who proved they
    // own the inbox, and each check costs one of the code's tries (checkEmailOtp counts it).
    // A taken phone still doesn't consume the code, so the customer can fix it and retry.
    const otpId = await checkEmailOtp({ email, purpose: "REGISTER", code: input.otpCode, now });
    await assertUnique(phone, email);
    const passwordHash = await hashPassword(input.password);

    const user: User = {
        id: randomUUID(),
        name: input.name.trim(),
        email,
        phone,
        passwordHash,
        role: "CUSTOMER",
        branchIds: [],
        permissions: [],
        status: "ACTIVE",
        phoneVerified: false, // only the email is verified
        emailVerified: true,
        createdAt: now.toISOString(),
    };
    try {
        // If the account can't be created (someone registered the same phone a moment ago),
        // the transaction rolls back and the code stays usable.
        await tx(async (s) => {
            await consumeEmailOtp(otpId, s, now);
            await UserModel.create([user], { session: s });
        });
    } catch (e) {
        mapDup(e);
    }
    return user;
}

export interface ProfileResult {
    name: string;
    phone: string;
    email: string | null;
    emailVerified: boolean;
    /** Customer changed their email: a code went here, the account email is unchanged until confirmed. */
    emailPending?: { email: string; sentTo: string; expiresInMinutes: number; resendInSeconds: number };
}

export async function updateProfile(
    userId: string,
    input: { name: string; phone: string; email: string; currentPassword?: string },
    opts: { ip?: string; now?: Date } = {}
): Promise<ProfileResult> {
    await connectDb();
    const user = await UserModel.findOne({ id: userId }).lean<User | null>();
    if (!user) throw new AppError("NOT_FOUND", "Account not found.", 404);

    const phone = normalizePhone(input.phone);
    const email = input.email.trim() ? normalizeEmail(input.email) : null;
    const name = input.name.trim();
    const emailChanged = (user.email ?? null) !== email;

    // Staff and Super Admins change their email/phone directly (no code), so the change must
    // be re-authorised with the current password. Otherwise a stolen staff session could point
    // the account at an attacker's email and take it over through "Forgot password".
    if (user.role !== "CUSTOMER" && (emailChanged || user.phone !== phone)) {
        const ok = !!input.currentPassword && (await verifyPassword(input.currentPassword, user.passwordHash));
        if (!ok) {
            const message = input.currentPassword ? "Your current password is incorrect." : "Enter your current password to change your phone or email.";
            throw new AppError("REAUTH_REQUIRED", message, 400, { currentPassword: input.currentPassword ? "Incorrect password" : "Required to change phone or email" });
        }
    }

    await assertUnique(phone, email, userId);
    // Customers: a NEW email only replaces the current one after its code is confirmed
    // (confirmEmailChange). Staff and Super Admins keep the direct update they had before.
    const verifyNewEmail = user.role === "CUSTOMER" && emailChanged && email !== null;

    let emailPending: ProfileResult["emailPending"];
    if (verifyNewEmail) {
        // Send first: if the code can't be sent, nothing is saved and the customer is told.
        // Saving again while the change is pending reuses the code already sent.
        const sent = await issueEmailOtp({ email: email!, purpose: "EMAIL_CHANGE", userId, ip: opts.ip, now: opts.now, reuseLive: true });
        emailPending = { email: email!, ...sent };
    }

    const set: Record<string, unknown> = { name, phone };
    if (emailChanged && !verifyNewEmail) {
        set.email = email;
        set.emailVerified = false; // a changed (or removed) email is never "verified" by inheritance
    }

    // Field names only. Phone and email values never go in the audit log.
    const changed = [user.name !== name && "name", user.phone !== phone && "phone", "email" in set && "email"]
        .filter(Boolean)
        .join(", ");
    try {
        await UserModel.updateOne({ id: userId }, { $set: set });
    } catch (e) {
        mapDup(e);
    }
    if (changed) {
        await logAudit({ id: userId, name }, { action: "PROFILE_CHANGED", entityType: "USER", entityId: userId, meta: { fields: changed } });
    }
    const current = "email" in set ? email : (user.email ?? null);
    return {
        name,
        phone,
        email: current,
        emailVerified: "email" in set ? false : user.emailVerified === true,
        ...(emailPending ? { emailPending } : {}),
    };
}

/** Customer only: (re)send a code to an email they want on the account (new, or the current unverified one). */
export async function sendEmailChangeCode(user: { id: string; role: string }, rawEmail: string, opts: { ip?: string; now?: Date } = {}) {
    if (user.role !== "CUSTOMER") throw new AppError("FORBIDDEN", "Not available for staff accounts.", 403);
    await connectDb();
    const email = normalizeEmail(rawEmail);
    const me = await UserModel.findOne({ id: user.id }, { email: 1, emailVerified: 1 }).lean<{ email: string | null; emailVerified?: boolean } | null>();
    if (!me) throw new AppError("NOT_FOUND", "Account not found.", 404);
    if (me.email === email && me.emailVerified === true) {
        throw new AppError("ALREADY_VERIFIED", "This email is already verified.", 409, { email: "Already verified" });
    }
    if (await UserModel.exists({ id: { $ne: user.id }, email })) throw taken("email");
    const sent = await issueEmailOtp({ email, purpose: "EMAIL_CHANGE", userId: user.id, ip: opts.ip, now: opts.now });
    return { email, ...sent };
}

/** Customer only: the code is checked, then the account email is replaced and marked verified in one transaction. */
export async function confirmEmailChange(user: { id: string; role: string; name: string }, rawEmail: string, code: string, now: Date = new Date()) {
    if (user.role !== "CUSTOMER") throw new AppError("FORBIDDEN", "Not available for staff accounts.", 403);
    await connectDb();
    const email = normalizeEmail(rawEmail);
    if (await UserModel.exists({ id: { $ne: user.id }, email })) throw taken("email"); // checked before using the code
    const otpId = await checkEmailOtp({ email, purpose: "EMAIL_CHANGE", userId: user.id, code, now });
    try {
        await tx(async (s) => {
            await consumeEmailOtp(otpId, s, now);
            await UserModel.updateOne({ id: user.id }, { $set: { email, emailVerified: true } }, { session: s });
        });
    } catch (e) {
        mapDup(e);
    }
    await logAudit({ id: user.id, name: user.name }, { action: "PROFILE_CHANGED", entityType: "USER", entityId: user.id, meta: { fields: "email (verified)" } });
    return { email, emailVerified: true };
}

export async function changePassword(userId: string, current: string, next: string) {
    await connectDb();
    const user = await UserModel.findOne({ id: userId }).lean<User | null>();
    if (!user) throw new AppError("NOT_FOUND", "Account not found.", 404);

    const ok = await verifyPassword(current, user.passwordHash);
    if (!ok) {
        throw new AppError("INVALID_CREDENTIALS", "Your current password is incorrect.", 400, {
            currentPassword: "Incorrect password",
        });
    }
    assertPasswordPolicy(user.role, next);
    await UserModel.updateOne({ id: userId }, { $set: { passwordHash: await hashPassword(next) } });
    await logAudit({ id: userId, name: user.name }, { action: "PASSWORD_CHANGED", entityType: "USER", entityId: userId });
}