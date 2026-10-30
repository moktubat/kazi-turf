import "server-only";
import { randomUUID } from "crypto";
import { normalizePhone } from "@/lib/phone";
import { AppError } from "@/server/http";
import { store } from "@/server/store";
import type { SessionUser } from "@/types";
import type { User } from "@/types/user";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";
import { logAudit } from "../audit";

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
    const id = parseIdentifier(identifier);
    const user = store.users.find((u) => (id.kind === "email" ? u.email === id.value : u.phone === id.value));
    // Always verify something, so response time does not reveal whether the account exists.
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || user.status !== "ACTIVE") return null;
    return user;
}

export function assertUnique(phone: string, email: string | null, selfId?: string) {
    if (store.users.some((u) => u.id !== selfId && u.phone === phone)) {
        throw new AppError("PHONE_TAKEN", "An account with this phone already exists.", 409, {
            phone: "Already registered. Try signing in.",
        });
    }
    if (email && store.users.some((u) => u.id !== selfId && u.email === email)) {
        throw new AppError("EMAIL_TAKEN", "An account with this email already exists.", 409, {
            email: "Already registered. Try signing in.",
        });
    }
}

export async function registerCustomer(input: {
    name: string;
    phone: string;
    email: string;
    password: string;
}): Promise<User> {
    const phone = normalizePhone(input.phone);
    const email = input.email.trim() ? input.email.trim().toLowerCase() : null;

    // Hash first, then check and insert with no await in between (Mongo unique indexes later).
    const passwordHash = await hashPassword(input.password);
    assertUnique(phone, email);

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
    store.users.push(user);
    return user;
}

export function updateProfile(userId: string, input: { name: string; phone: string; email: string }) {
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new AppError("NOT_FOUND", "Account not found.", 404);

    const phone = normalizePhone(input.phone);
    const email = input.email.trim() ? input.email.trim().toLowerCase() : null;
    assertUnique(phone, email, userId);

    // Field names only. Phone and email values never go in the audit log.
    const changed = [
        user.name !== input.name.trim() && "name",
        user.phone !== phone && "phone",
        user.email !== email && "email",
    ]
        .filter(Boolean)
        .join(", ");

    user.name = input.name.trim();
    user.phone = phone;
    user.email = email;
    if (changed) {
        logAudit({ id: user.id, name: user.name }, { action: "PROFILE_CHANGED", entityType: "USER", entityId: user.id, meta: { fields: changed } });
    }
    return { name: user.name, phone: user.phone, email: user.email };
}

export async function changePassword(userId: string, current: string, next: string) {
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new AppError("NOT_FOUND", "Account not found.", 404);

    const ok = await verifyPassword(current, user.passwordHash);
    if (!ok) {
        throw new AppError("INVALID_CREDENTIALS", "Your current password is incorrect.", 400, {
            currentPassword: "Incorrect password",
        });
    }
    user.passwordHash = await hashPassword(next);
    logAudit({ id: user.id, name: user.name }, { action: "PASSWORD_CHANGED", entityType: "USER", entityId: user.id });
}