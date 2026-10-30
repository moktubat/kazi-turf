import "server-only";
import { auditFor } from "@/server/audit";
import { canAccessBranch, assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { settle } from "@/server/bookings";
import { store } from "@/server/store";
import type { AdminBookingDto } from "@/types/admin";
import type { BookingStatus, PaymentStatus } from "@/types";
import type { Booking } from "@/types/booking";
import { assertSuperAdmin, findBookingForStaff } from "./access";
import { toAdminDto } from "./dto";

export interface BookingFilters {
    from?: string;
    to?: string;
    branch?: string;
    bookingStatus?: BookingStatus;
    paymentStatus?: PaymentStatus;
    source?: "online" | "counter";
    q?: string;
    request?: "open";
    limit?: number;
}

/** Branch scope is enforced here, so every caller gets it for free. */
export function filterBookings(user: ServerUser, f: BookingFilters, now: Date): Booking[] {
    if (f.branch) assertBranchAccess(user, f.branch);
    for (const b of store.bookings) settle(b, now);

    const openCodes =
        f.request === "open"
            ? new Set(store.changeRequests.filter((r) => r.status === "OPEN").map((r) => r.bookingCode))
            : null;

    const raw = f.q?.trim() ?? "";
    const upper = raw.toUpperCase();
    const lower = raw.toLowerCase();
    const phoneLike = /^[\d\s+-]+$/.test(raw);
    const digits = phoneLike ? raw.replace(/\D/g, "").replace(/^88/, "") : "";

    return store.bookings
        .filter((b) => {
            if (!canAccessBranch(user, b.branchId)) return false;
            if (f.branch && b.branchId !== f.branch) return false;
            if (f.from && b.date < f.from) return false;
            if (f.to && b.date > f.to) return false;
            // Expired holds are noise unless asked for.
            if (f.bookingStatus ? b.bookingStatus !== f.bookingStatus : b.bookingStatus === "EXPIRED") return false;
            if (f.paymentStatus && b.paymentStatus !== f.paymentStatus) return false;
            if (f.source && b.source !== f.source) return false;
            if (openCodes && !openCodes.has(b.bookingCode)) return false;
            if (raw) {
                const hit =
                    b.bookingCode.includes(upper) ||
                    b.customerName.toLowerCase().includes(lower) ||
                    (digits.length >= 3 && b.phone.includes(digits));
                if (!hit) return false;
            }
            return true;
        })
        .sort((a, b) => b.startAt.localeCompare(a.startAt));
}

export function searchBookings(user: ServerUser, f: BookingFilters, now: Date = new Date()): AdminBookingDto[] {
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 200);
    return filterBookings(user, f, now)
        .slice(0, limit)
        .map((b) => toAdminDto(b, user, now));
}

export function getBookingDetail(user: ServerUser, code: string, now: Date = new Date()) {
    const b = findBookingForStaff(user, code);
    return { booking: toAdminDto(b, user, now), audit: auditFor("BOOKING", b.bookingCode, 25) };
}

// CSV cells starting with = + - @ can run as formulas in spreadsheets. Neutralise them.
function cell(v: string | number): string {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}

export function bookingsCsv(user: ServerUser, f: BookingFilters, now: Date = new Date()): string {
    assertSuperAdmin(user);
    const header = [
        "Code", "Booking status", "Payment status", "Source", "Branch", "Pitch", "Date", "Start", "End",
        "Customer", "Phone", "Total", "Advance paid", "Balance due", "Cancel reason",
    ];
    const rows = filterBookings(user, f, now)
        .slice(0, 5000)
        .map((b) => {
            const d = toAdminDto(b, user, now);
            return [
                d.code, d.bookingStatus, d.paymentStatus, d.source, d.branchName, d.pitchName, d.date, d.start, d.end,
                d.customerName, d.phone, d.total, d.advancePaid, d.balanceDue, d.cancelReason ?? "",
            ];
        });
    return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}