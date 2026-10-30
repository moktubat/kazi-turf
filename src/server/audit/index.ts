// Append-only audit trail. Metadata must be safe: never secrets, tokens or credentials.
// Pass { session } to write the entry inside the same transaction as the action it records.
import "server-only";
import { randomUUID } from "crypto";
import type { ClientSession } from "mongoose";
import { AuditLogModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import type { AuditEntryDto } from "@/types/admin";
import type { AuditAction, AuditLog, AuditMeta } from "@/types/ops";

export async function logAudit(
    actor: { id: string; name: string },
    entry: {
        action: AuditAction;
        entityType: AuditLog["entityType"];
        entityId: string;
        branchId?: string | null;
        meta?: AuditMeta;
    },
    opts: { session?: ClientSession } = {}
): Promise<void> {
    await connectDb();
    await AuditLogModel.create(
        [
            {
                id: randomUUID(),
                actorId: actor.id,
                actorName: actor.name,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                branchId: entry.branchId ?? null,
                meta: entry.meta ?? {},
                at: new Date().toISOString(),
            },
        ],
        { session: opts.session }
    );
}

/** Newest first. */
export async function auditFor(entityType: AuditLog["entityType"], entityId: string, limit = 25): Promise<AuditEntryDto[]> {
    await connectDb();
    const rows = await AuditLogModel.find({ entityType, entityId }).sort({ at: -1 }).limit(limit).lean();
    return rows.map((a: any) => ({ id: a.id, action: a.action, actorName: a.actorName, at: a.at, meta: a.meta ?? {} }));
}