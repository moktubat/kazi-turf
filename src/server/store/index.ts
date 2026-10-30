// Temporary in-memory data layer. Replaced by Mongoose models (Batch 7).
// globalThis keeps one copy across route bundles and dev hot reloads.
import "server-only";
import { claims as seedClaims } from "@/data/claims";
import { demoUsers } from "@/data/users";
import { hashPasswordSync } from "@/server/auth/password";
import type { SlotClaim } from "@/types";
import type { ChangeRequest } from "@/types/account";
import type { Booking, Inquiry } from "@/types/booking";
import type { AuditLog, CheckIn, Payment } from "@/types/ops";
import type { SessionRecord, User } from "@/types/user";

interface Store {
    claims: SlotClaim[];
    bookings: Booking[];
    inquiries: Inquiry[];
    users: User[];
    sessions: SessionRecord[];
    changeRequests: ChangeRequest[];
    payments: Payment[];
    checkIns: CheckIn[];
    auditLogs: AuditLog[];
}

function seedUsers(): User[] {
    if (process.env.NODE_ENV === "production") return [];
    const now = new Date().toISOString();
    return demoUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        passwordHash: hashPasswordSync(u.password),
        role: u.role,
        branchIds: u.branchIds,
        permissions: u.permissions,
        status: "ACTIVE" as const,
        createdAt: now,
    }));
}

const g = globalThis as unknown as { __ktStore?: Store };

export const store: Store = (g.__ktStore ??= {
    claims: seedClaims.map((c) => ({ ...c })),
    bookings: [],
    inquiries: [],
    users: seedUsers(),
    sessions: [],
    changeRequests: [],
    payments: [],
    checkIns: [],
    auditLogs: [],
});

// Hot-reload safety: a store created by an older batch may lack newer collections.
store.payments ??= [];
store.checkIns ??= [];
store.auditLogs ??= [];