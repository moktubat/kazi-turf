import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { AccountView } from "@/components/pages/account/AccountView";
import { getSessionUser } from "@/server/auth/session";
import { listAccountBookings } from "@/server/bookings/account";

export const metadata: Metadata = { title: "My account" };

const CODE = /^KT-[A-HJ-NP-Z2-9]{6}$/;

type Params = Promise<Record<string, string | string[] | undefined>>;

function Band({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-evergreen text-white">
            <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-3 px-4 py-8 md:py-10">
                {children}
            </div>
        </div>
    );
}

function AccountFallback() {
    return (
        <>
            <Band>
                <div>
                    <h1 className="text-2xl font-extrabold text-white md:text-3xl">My account</h1>
                    <p className="text-white/75">Loading…</p>
                </div>
            </Band>
            <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 pb-28 md:pb-10">
                <div className="h-32 animate-pulse rounded-2xl bg-evergreen/10" />
                <div className="h-32 animate-pulse rounded-2xl bg-evergreen/10" />
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
    const { upcoming, history } = showBookings ? await listAccountBookings(user, new Date()) : { upcoming: [], history: [] };
    const isStaff = user.role === "STAFF" || user.role === "SUPER_ADMIN";

    return (
        <>
            <Band>
                <div>
                    <h1 className="text-2xl font-extrabold text-white md:text-3xl">My account</h1>
                    <p className="text-white/75">Hello, {user.name}.</p>
                </div>
                {isStaff && (
                    <Link
                        href="/admin"
                        className="inline-flex min-h-11 items-center rounded-xl border-2 border-white/40 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                    >
                        Open Staff Desk
                    </Link>
                )}
            </Band>

            <div className="mx-auto max-w-3xl px-4 py-8 pb-28 md:pb-10">
                <AccountView
                    profile={{ name: user.name, phone: user.phone, email: user.email ?? "" }}
                    upcoming={upcoming}
                    history={history}
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