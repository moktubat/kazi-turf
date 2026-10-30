import { canSetup } from "@/server/auth/permissions";
import { requireStaffPage } from "@/server/auth/pageGuards";
import { AdminNav } from "@/components/layout/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffPage("/admin");
  return (
    <div>
      <div className="border-b border-evergreen/10 bg-white">
        <div className="mx-auto max-w-6xl px-4">
          <AdminNav role={user.role} canSetup={canSetup(user)} />
        </div>
      </div>
      {children}
    </div>
  );
}