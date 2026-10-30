import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginCard } from "@/components/auth/LoginCard";
import { Card } from "@/components/ui/Card";
import { safeNext } from "@/lib/safeNext";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: Params }) {
    const sp = await searchParams;
    const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));

    const next = safeNext(one("next"));
    const user = await getSessionUser();
    if (user) redirect(next ?? "/account");

    return (
        <div className="mx-auto max-w-md px-4 py-10">
            <h1 className="text-2xl font-extrabold md:text-3xl">Welcome to KaziTurf</h1>
            <p className="mt-1 text-evergreen/80">Sign in to pay for your slot and see your bookings.</p>
            <Card className="mt-6">
                <LoginCard next={next} initialMode={one("mode") === "signup" ? "signup" : "signin"} />
            </Card>
        </div>
    );
}