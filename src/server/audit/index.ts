// Append-only audit trail. Metadata must be safe: never secrets, tokens or credentials.
import "server-only";
import { randomUUID } from "crypto";
import { store } from "@/server/store";
import type { AuditEntryDto } from "@/types/admin";
import type { AuditAction, AuditLog, AuditMeta } from "@/types/ops";

export function logAudit(
    actor: { id: string; name: string },
    entry: {
        action: AuditAction;
        entityType: AuditLog["entityType"];
        entityId: string;
        branchId?: string | null;
        meta?: AuditMeta;
    }
) {
    store.auditLogs.push({
        id: randomUUID(),
        actorId: actor.id,
        actorName: actor.name,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        branchId: entry.branchId ?? null,
        meta: entry.meta ?? {},
        at: new Date().toISOString(),
    });
}

/** Newest first. */
export function auditFor(entityType: AuditLog["entityType"], entityId: string, limit = 25): AuditEntryDto[] {
    return store.auditLogs
        .filter((a) => a.entityType === entityType && a.entityId === entityId)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit)
        .map(({ id, action, actorName, at, meta }) => ({ id, action, actorName, at, meta }));
}