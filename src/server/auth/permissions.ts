import "server-only";
import { AppError } from "@/server/http";
import { assertBranchAccess } from "./guards";
import type { ServerUser } from "./session";

/** Staff with this permission can edit pitches and rates for their assigned branches (spec §3). */
export const PITCHES_EDIT = "pitches.edit";

export function canSetup(user: ServerUser): boolean {
    return user.role === "SUPER_ADMIN" || (user.role === "STAFF" && user.permissions.includes(PITCHES_EDIT));
}

export function assertSetupAccess(user: ServerUser) {
    if (!canSetup(user)) throw new AppError("FORBIDDEN", "You do not have access to Setup.", 403);
}

export function assertPitchEditor(user: ServerUser, branchId: string) {
    assertSetupAccess(user);
    assertBranchAccess(user, branchId);
}