import "server-only";
import { randomUUID } from "crypto";
import { normalizePhone } from "@/lib/phone";
import { UserModel } from "@/models";
import { logAudit } from "@/server/audit";
import { connectDb } from "@/server/db/connect";
import { dupField, isDup, plain } from "@/server/db/util";
import { AppError } from "@/server/http";
import type { SessionUser } from "@/types";
import type { User } from "@/types/user";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

export function toSessionUser(u: User): SessionUser {
    return { id: u.id, name: u.name, role: u.role };
}

function parseIdentifier(raw: string) {
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
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || user.status !== "ACTIVE") return null;
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

export async function registerCustomer(input: {
    name: string;
    phone: string;
    email: string;
    password: string;
}): Promise<User> {
    await connectDb();
    const phone = normalizePhone(input.phone);
    const email = input.email.trim() ? input.email.trim().toLowerCase() : null;

    const passwordHash = await hashPassword(input.password);
    await assertUnique(phone, email);

    const user: User = {
        id: randomUUID(),
        name: input.name.trim(),
        email,
        phone,
        passwordHash,
        role: "CUSTOMER", // never taken from the browser
        branchIds: [],
        permissions: [],
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
    };
    try {
        await UserModel.create(user);
    } catch (e) {
        mapDup(e); // two sign-ups racing: the unique index decides
    }
    return user;
}

export async function updateProfile(userId: string, input: { name: string; phone: string; email: string }) {
    await connectDb();
    const user = await UserModel.findOne({ id: userId }).lean<any>();
    if (!user) throw new AppError("NOT_FOUND", "Account not found.", 404);

    const phone = normalizePhone(input.phone);
    const email = input.email.trim() ? input.email.trim().toLowerCase() : null;
    await assertUnique(phone, email, userId);

    // Field names only. Phone and email values never go in the audit log.
    const changed = [
        user.name !== input.name.trim() && "name",
        user.phone !== phone && "phone",
        (user.email ?? null) !== email && "email",
    ]
        .filter(Boolean)
        .join(", ");

    const name = input.name.trim();
    try {
        await UserModel.updateOne({ id: userId }, { $set: { name, phone, email } });
    } catch (e) {
        mapDup(e);
    }
    if (changed) {
        await logAudit({ id: userId, name }, { action: "PROFILE_CHANGED", entityType: "USER", entityId: userId, meta: { fields: changed } });
    }
    return { name, phone, email };
}

export async function changePassword(userId: string, current: string, next: string) {
    await connectDb();
    const user = await UserModel.findOne({ id: userId }).lean<any>();
    if (!user) throw new AppError("NOT_FOUND", "Account not found.", 404);

    const ok = await verifyPassword(current, user.passwordHash);
    if (!ok) {
        throw new AppError("INVALID_CREDENTIALS", "Your current password is incorrect.", 400, {
            currentPassword: "Incorrect password",
        });
    }
    await UserModel.updateOne({ id: userId }, { $set: { passwordHash: await hashPassword(next) } });
    await logAudit({ id: userId, name: user.name }, { action: "PASSWORD_CHANGED", entityType: "USER", entityId: userId });
}