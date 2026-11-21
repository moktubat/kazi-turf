import "server-only";
import { BookingModel, ChangeRequestModel } from "@/models";
import { auditFor } from "@/server/audit";
import { assertBranchAccess } from "@/server/auth/guards";
import type { ServerUser } from "@/server/auth/session";
import { toDto } from "@/server/bookings";
import { settleExpired } from "@/server/bookings/expire";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import type { AdminBookingDto } from "@/types/admin";
import type { BookingStatus, PaymentStatus } from "@/types";
import type { Booking } from "@/types/booking";
import { assertSuperAdmin, findBookingForStaff } from "./access";
import { toAdminDto, toAdminDtos } from "./dto";

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
    /** Keyset cursor from the previous page: "<startAt>|<bookingCode>" of its last row. */
    before?: string;
}

/** Newest first; bookingCode breaks ties so pages never overlap or skip a row. */
const ORDER = { startAt: -1, bookingCode: -1 } as const;
export const cursorOf = (b: Pick<Booking, "startAt" | "bookingCode">) => `${b.startAt}|${b.bookingCode}`;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Branch scope is enforced here, so every caller gets it for free. */
export async function filterBookings(user: ServerUser, f: BookingFilters, now: Date, limit: number): Promise<Booking[]> {
    if (f.branch) assertBranchAccess(user, f.branch);
    await connectDb();

    const q: Record<string, unknown> = {};
    if (f.branch) q.branchId = f.branch;
    else if (user.role !== "SUPER_ADMIN") q.branchId = { $in: user.branchIds };

    await settleExpired(q, now);

    if (f.from || f.to) q.date = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
    // Expired holds are noise unless asked for, except when money moved: a payment that arrived
    // after the hold expired leaves an EXPIRED booking with a refund to make, and that must be findable.
    if (f.bookingStatus) q.bookingStatus = f.bookingStatus;
    else q.$nor = [{ bookingStatus: "EXPIRED", paymentStatus: { $nin: ["REFUND_PENDING", "REFUNDED"] } }];
    if (f.paymentStatus) q.paymentStatus = f.paymentStatus;
    if (f.source) q.source = f.source;
    if (f.request === "open") q.bookingCode = { $in: await ChangeRequestModel.distinct("bookingCode", { status: "OPEN" }) };

    const raw = f.q?.trim() ?? "";
    if (raw) {
        const digits = /^[\d\s+-]+$/.test(raw) ? raw.replace(/\D/g, "").replace(/^88/, "") : "";
        const or: Record<string, unknown>[] = [
            { bookingCode: { $regex: esc(raw.toUpperCase()) } },
            { customerName: { $regex: esc(raw), $options: "i" } },
        ];
        if (digits.length >= 3) or.push({ phone: { $regex: esc(digits) } });
        q.$or = or;
    }

    if (f.before) {
        const [startAt, code] = f.before.split("|");
        // Rows strictly after the cursor in ORDER. $and keeps it separate from the search $or.
        q.$and = [{ $or: [{ startAt: { $lt: startAt } }, { startAt, bookingCode: { $lt: code } }] }];
    }

    return plainAll<Booking>(await BookingModel.find(q).sort(ORDER).limit(limit).lean());
}

export async function searchBookings(user: ServerUser, f: BookingFilters, now: Date = new Date()): Promise<AdminBookingDto[]> {
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 200);
    const rows = await filterBookings(user, f, now, limit);
    return toAdminDtos(rows, user, now);
}

/** One page of the Bookings list, plus the cursor for the next page (null when this is the last). */
export async function searchBookingsPage(
    user: ServerUser,
    f: BookingFilters,
    now: Date = new Date()
): Promise<{ bookings: AdminBookingDto[]; next: string | null }> {
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 200);
    const rows = await filterBookings(user, f, now, limit + 1); // one extra row says whether more exist
    const page = rows.slice(0, limit);
    return {
        bookings: await toAdminDtos(page, user, now),
        next: rows.length > limit ? cursorOf(page[page.length - 1]) : null,
    };
}

export async function getBookingDetail(user: ServerUser, code: string, now: Date = new Date()) {
    const b = await findBookingForStaff(user, code);
    const [booking, audit] = await Promise.all([toAdminDto(b, user, now), auditFor("BOOKING", b.bookingCode, 25)]);
    return { booking, audit };
}

// CSV cells starting with = + - @ can run as formulas in spreadsheets. Neutralise them.
function cell(v: string | number): string {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}

export async function bookingsCsv(user: ServerUser, f: BookingFilters, now: Date = new Date()): Promise<string> {
    assertSuperAdmin(user);
    const header = [
        "Code", "Booking status", "Payment status", "Source", "Pitch", "Date", "Start", "End",
        "Customer", "Phone", "Total", "Advance paid", "Balance due", "Cancel reason", "Discount",
        "Additional charge", "Charge reason",
    ];
    const rows = (await filterBookings(user, f, now, 5000)).map((b) => {
        const d = toDto(b, now);
        return [
            d.code, d.bookingStatus, d.paymentStatus, b.source, d.pitchName, d.date, d.start, d.end,
            b.customerName, b.phone, d.total, d.advancePaid, d.balanceDue, b.cancelReason ?? "", d.discountAmount,
            d.additionalChargeAmount, d.additionalChargeReason ?? "",
        ];
    });
    return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}