import type { Metadata } from "next";
import { StaffDesk } from "@/components/pages/admin/StaffDesk";
import { addDays } from "@/lib/time";
import { accessibleBranches } from "@/server/admin/access";
import { requireStaffPage } from "@/server/auth/pageGuards";
import { todayDhaka } from "@/lib/time.server";
import { getPublicPolicies } from "@/server/public-data";

export const instant = false;
export const metadata: Metadata = { title: "Staff Desk" };

export default async function AdminPage() {
    const user = await requireStaffPage("/admin");
    const mine = accessibleBranches(user);
    const venue = mine[0];

    // Fetch policies from the backend instead of @/data/site
    const policies = await getPublicPolicies();
    console.log("[admin-page] policies from backend:", {
        slotMinutes: policies.slotMinutes,
        horizon: policies.bookingHorizonDays,
    });

    if (!venue) {
        return (
            <div className="mx-auto max-w-xl px-4 py-16 text-center">
                <h1 className="text-2xl font-extrabold">No venue access</h1>
                <p className="mt-2 text-evergreen/80">Ask a Super Admin to grant you access to the venue.</p>
                <a href="/account" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-teal px-4 font-heading text-sm font-semibold text-teal hover:bg-mint">
                    Go to my account
                </a>
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