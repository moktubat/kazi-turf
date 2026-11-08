import { canSetup } from "@/server/auth/permissions";
import { requireStaffPage } from "@/server/auth/pageGuards";
import { AdminNav } from "@/components/layout/admin/AdminNav";
import { Suspense } from "react";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffPage("/admin");
  const setup = canSetup(user);

  return (
    <div className="min-h-[70vh] bg-canvas lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-evergreen/10 bg-surface lg:block">
        <div className="sticky top-16 p-4">
          <Suspense fallback={null}>
            <AdminNav role={user.role} canSetup={setup} variant="sidebar" />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phones and tablets: pill bar */}
        <div className="border-b border-evergreen/10 bg-surface shadow-sm lg:hidden">
          <div className="mx-auto max-w-main px-4">
            <AdminNav role={user.role} canSetup={setup} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}