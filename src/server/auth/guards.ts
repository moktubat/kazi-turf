// Authorize inside every handler and page. Hiding UI is not security.
import "server-only";
import { AppError } from "@/server/http";
import { getSessionUser, type ServerUser } from "./session";

export async function requireUser(): Promise<ServerUser> {
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
    return user;
}

export async function requireStaff(): Promise<ServerUser> {
    const user = await requireUser();
    if (user.role !== "STAFF" && user.role !== "SUPER_ADMIN") {
        throw new AppError("FORBIDDEN", "You do not have access to this.", 403);
    }
    return user;
}

export function canAccessBranch(user: ServerUser, branchId: string): boolean {
    if (user.role === "SUPER_ADMIN") return true;
    return user.role === "STAFF" && user.branchIds.includes(branchId);
}

export function assertBranchAccess(user: ServerUser, branchId: string) {
    if (!canAccessBranch(user, branchId)) {
        throw new AppError("FORBIDDEN", "You do not have access to this branch.", 403);
    }
}