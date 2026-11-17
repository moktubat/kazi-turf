import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CalendarCheck, Check, Goal, Sparkles } from "lucide-react";

import { LoginCard } from "@/components/auth/LoginCard";
import { safeNext } from "@/lib/safeNext";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = {
    title: "Sign in",
    description: "Sign in to Kazi Sports Arena to book your indoor sports slot and manage your bookings.",
    robots: NOINDEX,
};

type Params = Promise<Record<string, string | string[] | undefined>>;

const points = [
    "Pay a bKash advance to lock your slot",
    "Pay the balance at the venue",
    "Show your booking code on arrival",
];

const glassCard =
    "absolute grid place-items-center rounded-3xl border border-white/30 bg-white/15 shadow-2xl backdrop-blur-md";

function BrandPanel() {
    return (
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-teal via-evergreen to-pitch text-white lg:block">
            <div aria-hidden className="absolute inset-0">
                <span className="absolute -left-1/4 top-[6%] h-28 w-[160%] -rotate-[35deg] bg-gradient-to-r from-white/15 to-transparent" />
                <span className="absolute -left-1/4 top-[36%] h-40 w-[160%] -rotate-[35deg] bg-gradient-to-r from-white/10 to-transparent" />
                <span className="absolute -left-1/4 top-[66%] h-24 w-[160%] -rotate-[35deg] bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            <div aria-hidden className="absolute inset-0">
                <div className={`${glassCard} left-[12%] top-[24%] size-36 -rotate-12 xl:size-44`}>
                    <Goal size={56} className="text-white/90" />
                </div>
                <div className={`${glassCard} left-[46%] top-[34%] size-36 rotate-[14deg] xl:size-44`}>
                    <CalendarCheck size={56} className="text-white/90" />
                </div>
                <Sparkles size={22} className="absolute left-[8%] top-[40%] text-white/80" />
                <Sparkles size={22} className="absolute left-[84%] top-[32%] text-white/80" />
            </div>

            <div className="absolute inset-x-0 bottom-0 p-8 xl:p-12">
                <p className="max-w-md font-heading text-3xl font-extrabold leading-tight text-white xl:text-4xl">
                    Book your slot in a few taps.
                </p>
                <p className="mt-2 max-w-sm text-sm text-white/75">
                    Sign in to pay for your slot and see your bookings.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm [@media(max-height:720px)]:hidden">
                    {points.map((p) => (
                        <li key={p} className="flex items-center gap-3">
                            <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald text-evergreen">
                                <Check size={12} aria-hidden />
                            </span>
                            {p}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function LoginShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="-mb-24 grid h-svh md:mb-0 lg:grid-cols-2">
            <BrandPanel />

            <div className="flex flex-col overflow-y-auto bg-canvas px-4 pb-8 pt-20">
                <div className="m-auto w-full max-w-sm">
                    <h1 className="text-3xl font-extrabold">Welcome to Kazi Sports Arena</h1>
                    <p className="mb-6 mt-1 text-sm text-evergreen/75">
                        Login or create an account to book and pay for your slot.
                    </p>
                    {children}
                </div>
            </div>
        </div>
    );
}

function LoginFallback() {
    return (
        <LoginShell>
            <div aria-hidden className="space-y-4">
                <div className="h-11 animate-pulse rounded-full bg-evergreen/10" />
                <div className="h-48 animate-pulse rounded-xl bg-evergreen/10" />
            </div>
        </LoginShell>
    );
}

async function LoginContent({ searchParams }: { searchParams: Params }) {
    await connection();

    const sp = await searchParams;
    const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : (sp[k] as string | undefined));
    const next = safeNext(one("next"));

    const user = await getSessionUser();
    if (user) {
        redirect(next ?? "/account");
    }

    return (
        <LoginShell>
            <LoginCard
                next={next}
                initialMode={one("mode") === "signup" ? "signup" : "signin"}
                resetToken={one("reset") ?? null}
            />
        </LoginShell>
    );
}

export default function LoginPage({ searchParams }: { searchParams: Params }) {
    return (
        <Suspense fallback={<LoginFallback />}>
            <LoginContent searchParams={searchParams} />
        </Suspense>
    );
}