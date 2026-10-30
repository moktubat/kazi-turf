// src/app/(customer)/account/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountView } from "@/components/pages/account/AccountView";
import { getSessionUser } from "@/server/auth/session";
import { listAccountBookings } from "@/server/bookings/account";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

const CODE = /^KT-[A-HJ-NP-Z2-9]{6}$/;

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountPage({ searchParams }: { searchParams: Params }) {
    const sp = await searchParams;
    const raw = Array.isArray(sp.b) ? sp.b[0] : sp.b;
    const code = raw && CODE.test(raw) ? raw : null;

    const user = await getSessionUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(code ? `/account?b=${code}` : "/account")}`);

    // Staff do not hold customer bookings (spec §3). They see their profile only.
    const showBookings = user.role !== "STAFF";
    const { upcoming, history } = showBookings ? listAccountBookings(user) : { upcoming: [], history: [] };
    const isStaff = user.role === "STAFF" || user.role === "SUPER_ADMIN";

    return (
        <div className="mx-auto max-w-3xl px-4 py-8 pb-28 md:pb-10">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h1 className="text-2xl font-extrabold md:text-3xl">My account</h1>
                    <p className="text-evergreen/80">Hello, {user.name}.</p>
                </div>
                {isStaff && (
                    <Link href="/admin" className="font-semibold text-teal underline underline-offset-2">
                        Open Staff Desk
                    </Link>
                )}
            </div>

            <AccountView
                profile={{ name: user.name, phone: user.phone, email: user.email ?? "" }}
                upcoming={upcoming}
                history={history}
                initialCode={code}
                showBookings={showBookings}
            />
        </div>
    );
}