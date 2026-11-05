import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";

import { LoginCard } from "@/components/auth/LoginCard";
import { safeNext } from "@/lib/safeNext";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const points = [
    "Pay a bKash advance to lock your slot",
    "Pay the balance at the venue",
    "Show your booking code on arrival",
];

function LoginShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid min-h-[calc(100svh-4rem)] lg:grid-cols-2">
            <div className="bg-evergreen px-4 py-10 text-white lg:flex lg:items-center lg:px-12">
                <div className="mx-auto w-full max-w-md lg:mx-0">
                    <p className="mb-2 font-heading text-xs font-bold uppercase tracking-[0.18em] text-emerald">
                        KaziTurf
                    </p>
                    <h1 className="text-2xl font-extrabold text-white md:text-4xl">Welcome to KaziTurf</h1>
                    <p className="mt-2 text-white/75">Sign in to pay for your slot and see your bookings.</p>
                    <ul className="mt-6 hidden space-y-3 text-sm lg:block">
                        {points.map((p) => (
                            <li key={p} className="flex items-center gap-3">
                                <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald text-evergreen">
                                    <Check size={14} aria-hidden />
                                </span>
                                {p}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="flex items-start justify-center px-4 py-8 lg:items-center lg:py-10">
                <div className="w-full max-w-md rounded-2xl border border-evergreen/10 bg-white p-5 shadow-lg md:p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}

function LoginFallback() {
    return (
        <LoginShell>
            <div className="min-h-64 animate-pulse" />
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
            <LoginCard next={next} initialMode={one("mode") === "signup" ? "signup" : "signin"} />
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