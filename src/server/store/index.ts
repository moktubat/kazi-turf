// Temporary in-memory data layer. Replaced by Mongoose models (Batch 7).
// globalThis keeps one copy across route bundles and dev hot reloads.
import "server-only";
import type { ChangeRequest } from "@/types/account";
import type { Booking, Inquiry } from "@/types/booking";
import type { AuditLog, CheckIn, Payment } from "@/types/ops";
import type { SessionRecord, User } from "@/types/user";

interface Store {
    bookings: Booking[];
    inquiries: Inquiry[];
    users: User[];
    sessions: SessionRecord[];
    changeRequests: ChangeRequest[];
    payments: Payment[];
    checkIns: CheckIn[];
    auditLogs: AuditLog[];
}

const g = globalThis as unknown as { __ktStore?: Store };
export const store: Store = (g.__ktStore ??= {
    bookings: [],
    inquiries: [],
    users: [],
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