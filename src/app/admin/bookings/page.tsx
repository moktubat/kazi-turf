import type { Metadata } from "next";
import { Suspense } from "react";

import { BookingsView } from "@/components/pages/admin/BookingsView";
import { addDays } from "@/lib/time";
import { todayDhaka } from "@/lib/time.server";
import { requireStaffPage } from "@/server/auth/pageGuards";

export const metadata: Metadata = {
    title: "Bookings",
};

type Params = Promise<Record<string, string | string[] | undefined>>;

function BookingsFallback() {
    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <div className="h-9 w-48 animate-pulse rounded-lg bg-evergreen/10" />

            <div className="h-64 animate-pulse rounded-xl bg-evergreen/5" />
        </div>
    );
}

async function BookingsContent({
    searchParams,
}: {
    searchParams: Params;
}) {
    const sp = await searchParams;

    const user = await requireStaffPage("/admin/bookings");

    const today = await todayDhaka();

    const requestParam = Array.isArray(sp.request)
        ? sp.request[0]
        : sp.request;

    const requestOnly = requestParam === "open";

    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">
                Bookings
            </h1>

            <BookingsView
                role={user.role}
                defaults={{
                    from: requestOnly
                        ? addDays(today, -90)
                        : addDays(today, -7),
                    to: addDays(today, 30),
                    requestOnly,
                }}
            />
        </div>
    );
}

export default function AdminBookingsPage({
    searchParams,
}: {
    searchParams: Params;
}) {
    return (
        <Suspense fallback={<BookingsFallback />}>
            <BookingsContent searchParams={searchParams} />
        </Suspense>
    );
}
