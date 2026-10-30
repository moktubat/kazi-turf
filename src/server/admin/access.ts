import "server-only";
import { branches } from "@/data/branches";
import { canAccessBranch } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { findBookingByCode } from "@/server/bookings";
import { AppError } from "@/server/http";
import type { Booking } from "@/types/booking";

/** Branches the user may operate (Coming Soon branches have no pitches yet). */
export function accessibleBranches(user: ServerUser) {
    return branches.filter((b) => b.status !== "COMING_SOON" && canAccessBranch(user, b.id));
}

export function assertSuperAdmin(user: ServerUser) {
    if (user.role !== "SUPER_ADMIN") {
        throw new AppError("FORBIDDEN", "Only a Super Admin can do this.", 403);
    }
}

/** Same "not found" for missing and out-of-branch bookings, so codes cannot be probed. */
export async function findBookingForStaff(user: ServerUser, code: string): Promise<Booking> {
    const b = await findBookingByCode(code);
    if (!b || !canAccessBranch(user, b.branchId)) {
        throw new AppError("NOT_FOUND", "Booking not found.", 404);
    }
    return b;
}