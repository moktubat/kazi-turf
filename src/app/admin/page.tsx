import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/Button";
import { StaffDesk } from "@/components/pages/admin/StaffDesk";
import { addDays } from "@/lib/time";
import { accessibleBranches } from "@/server/admin/access";
import { requireStaffPage } from "@/server/auth/pageGuards";
import { todayDhaka } from "@/lib/time.server";
import { getPublicPolicies } from "@/server/public-data";

export const metadata: Metadata = { title: "Staff Desk" };

function StaffDeskFallback() {
    return (
        <div className="mx-auto max-w-main px-4 py-6 pb-32 lg:pb-10">
            <div className="h-8 w-48 animate-pulse rounded bg-evergreen/10" />
            <div className="mt-6 h-64 animate-pulse rounded-2xl bg-evergreen/10" />
        </div>
    );
}

async function AdminContent() {
    const user = await requireStaffPage("/admin");
    const mine = accessibleBranches(user);
    const venue = mine[0];

    const policies = await getPublicPolicies();

    if (!venue) {
        return (
            <div className="mx-auto max-w-xl px-4 py-16 text-center">
                <h1 className="text-2xl font-extrabold">No venue access</h1>
                <p className="mt-2 text-evergreen/80">Ask a Super Admin to grant you access to the venue.</p>
                <Button href="/account" variant="outline" className="mt-6">
                    Go to my account
                </Button>
            </div>
        );
    }

    const today = await todayDhaka();

    return (
        <StaffDesk
            venue={{ id: venue.id, name: venue.name }}
            today={today}
            maxDate={addDays(today, policies.bookingHorizonDays)}
            role={user.role}
        />
    );
}

export default function AdminPage() {
    return (
        <Suspense fallback={<StaffDeskFallback />}>
            <AdminContent />
        </Suspense>
    );
}