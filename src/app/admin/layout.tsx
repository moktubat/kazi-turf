import { canSetup } from "@/server/auth/permissions";
import { requireStaffPage } from "@/server/auth/pageGuards";
import { AdminNav } from "@/components/layout/admin/AdminNav";

// Admin routes are auth-gated and per-request — never prerender them.
// This applies to ALL routes under /admin/* (desk, bookings, setup, insights).
export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffPage("/admin");
  return (
    <div className="min-h-[70vh] bg-mint/30">
      <div className="border-b border-evergreen/10 bg-white shadow-sm">
        <div className="mx-auto max-w-6xl px-4">
          <AdminNav role={user.role} canSetup={canSetup(user)} />
        </div>
      </div>
      {children}
    </div>
  );
}