import type { Metadata } from "next";
import { StaffDesk } from "@/components/pages/admin/StaffDesk";
import { Button } from "@/components/ui/Button";
import { policies } from "@/data/site";
import { addDays, todayDhaka } from "@/lib/time";
import { accessibleBranches } from "@/server/admin/access";
import { requireStaffPage } from "@/server/auth/pageGuards";

export const metadata: Metadata = { title: "Staff Desk" };

export default async function AdminPage() {
    const user = await requireStaffPage("/admin");
    const branches = accessibleBranches(user).map(({ id, name }) => ({ id, name }));

    if (branches.length === 0) {
        return (
            <div className="mx-auto max-w-xl px-4 py-16 text-center">
                <h1 className="text-2xl font-extrabold">No branch assigned</h1>
                <p className="mt-2 text-evergreen/80">Ask a Super Admin to assign you to a branch.</p>
                <Button href="/account" className="mt-6" variant="outline">Go to my account</Button>
            </div>
        );
    }

    const today = todayDhaka();
    return (
        <StaffDesk
            branches={branches}
            today={today}
            maxDate={addDays(today, policies.bookingHorizonDays)}
            role={user.role}
        />
    );
}