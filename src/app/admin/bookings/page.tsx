import type { Metadata } from "next";
import { BookingsView } from "@/components/pages/admin/BookingsView";
import { addDays, todayDhaka } from "@/lib/time";
import { accessibleBranches } from "@/server/admin/access";
import { requireStaffPage } from "@/server/auth/pageGuards";

export const metadata: Metadata = { title: "Bookings" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminBookingsPage({ searchParams }: { searchParams: Params }) {
    const sp = await searchParams;
    const user = await requireStaffPage("/admin/bookings");
    const branches = accessibleBranches(user).map(({ id, name }) => ({ id, name }));

    const today = await todayDhaka();
    const requestOnly = (Array.isArray(sp.request) ? sp.request[0] : sp.request) === "open";

    return (
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Bookings</h1>
            <BookingsView
                branches={branches}
                role={user.role}
                defaults={{
                    // Open requests can be on any date, so widen the range for that link.
                    from: requestOnly ? addDays(today, -90) : addDays(today, -7),
                    to: addDays(today, 30),
                    requestOnly,
                }}
            />
        </div>
    );
}