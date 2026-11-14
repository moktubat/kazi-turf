import { Suspense } from "react";

import { canSetup } from "@/server/auth/permissions";
import { requireStaffPage } from "@/server/auth/pageGuards";
import { AdminNav } from "@/components/layout/admin/AdminNav";

async function AdminLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaffPage("/admin");
  const setup = canSetup(user);

  return (
    <div className="min-h-[70vh] bg-canvas lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-evergreen/10 bg-surface lg:block">
        <div className="sticky top-16 p-4">
          <Suspense fallback={<div className="min-h-40" />}>
            <AdminNav
              role={user.role}
              canSetup={setup}
              variant="sidebar"
            />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="border-b border-evergreen/10 bg-surface shadow-sm lg:hidden">
          <div className="mx-auto max-w-main px-4">
            <Suspense fallback={<div className="h-16" />}>
              <AdminNav
                role={user.role}
                canSetup={setup}
              />
            </Suspense>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] bg-canvas">
          <div className="mx-auto max-w-main animate-pulse px-4 py-8">
            <div className="h-8 w-48 rounded bg-evergreen/10" />
          </div>
        </div>
      }
    >
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}