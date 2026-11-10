import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { CalendarCheck } from "lucide-react";
import { AccountView } from "@/components/pages/account/AccountView";
import { getSessionUser } from "@/server/auth/session";
import { listAccountBookings } from "@/server/bookings/account";

export const metadata: Metadata = { title: "My account" };

const CODE = /^KT-[A-HJ-NP-Z2-9]{6}$/;

type Params = Promise<Record<string, string | string[] | undefined>>;

function PageHeader({ name, isStaff }: { name: string; isStaff: boolean }) {
  return (
    <header className="border-b border-evergreen/10 bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-4 py-6 md:py-8">
        <div className="min-w-0 space-y-1.5">
          <p className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.18em] text-teal">
            <span aria-hidden className="h-0.5 w-6 bg-teal" />
            Account
          </p>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight md:text-3xl">
            My account
          </h1>
          <p className="text-sm text-evergreen/70">
            Hello, {name}. Manage your bookings and profile.
          </p>
        </div>
        {isStaff && (
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-teal px-4 font-heading text-sm font-semibold text-teal transition-colors hover:bg-mint"
          >
            <CalendarCheck size={16} aria-hidden /> Open Staff Desk
          </Link>
        )}
      </div>
    </header>
  );
}

function AccountFallback() {
  return (
    <>
      <PageHeader name="…" isStaff={false} />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 pb-28 md:pb-10">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-evergreen/5" />
        <div className="h-32 animate-pulse rounded-2xl bg-evergreen/5" />
        <div className="h-24 animate-pulse rounded-2xl bg-evergreen/5" />
        <div className="h-24 animate-pulse rounded-2xl bg-evergreen/5" />
      </div>
    </>
  );
}

async function AccountContent({ searchParams }: { searchParams: Params }) {
  await connection();
  const sp = await searchParams;
  const raw = Array.isArray(sp.b) ? sp.b[0] : sp.b;
  const code = raw && CODE.test(raw) ? raw : null;

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(code ? `/account?b=${code}` : "/account")}`);

  const showBookings = user.role !== "STAFF";
  const { upcoming, history, refunds } = showBookings
    ? await listAccountBookings(user, new Date())
    : { upcoming: [], history: [], refunds: [] };
  const isStaff = user.role === "STAFF" || user.role === "SUPER_ADMIN";

  return (
    <>
      <PageHeader name={user.name} isStaff={isStaff} />
      <div className="mx-auto max-w-5xl px-4 py-6 pb-28 md:py-8 md:pb-12">
        <AccountView
          profile={{ name: user.name, phone: user.phone, email: user.email ?? "" }}
          upcoming={upcoming}
          history={history}
          refunds={refunds}
          initialCode={code}
          showBookings={showBookings}
        />
      </div>
    </>
  );
}

export default function AccountPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<AccountFallback />}>
      <AccountContent searchParams={searchParams} />
    </Suspense>
  );
}