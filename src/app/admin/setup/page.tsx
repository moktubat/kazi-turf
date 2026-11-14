import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { requireSetupPage } from "@/server/auth/pageGuards";
import { SetupView } from "@/components/pages/admin/setup/SetupView";
import { getSetupData } from "@/server/admin/setup";
import type { SetupTab } from "@/types/setup";

export const metadata: Metadata = { title: "Setup" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const VALID_TABS: SetupTab[] = [
    "venue",
    "pitches",
    "rates",
    "staff",
    "policies",
];

function SetupFallback() {
    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5">
            <div className="h-9 w-40 animate-pulse rounded-lg bg-evergreen/10" />
            <div className="h-16 animate-pulse rounded-2xl bg-evergreen/5" />
            <div className="h-64 animate-pulse rounded-2xl bg-evergreen/5" />
        </div>
    );
}

async function SetupContent({
    searchParams,
}: {
    searchParams: Params;
}) {
    await connection();

    const sp = await searchParams;
    const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;

    const initialTab: SetupTab = VALID_TABS.includes(rawTab as SetupTab)
        ? (rawTab as SetupTab)
        : "venue";

    const user = await requireSetupPage("/admin/setup");
    const setupData = await getSetupData(user, new Date());

    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">
                Setup
            </h1>

            <SetupView
                data={setupData}
                initialTab={initialTab}
            />
        </div>
    );
}

export default function SetupPage({
    searchParams,
}: {
    searchParams: Params;
}) {
    return (
        <Suspense fallback={<SetupFallback />}>
            <SetupContent searchParams={searchParams} />
        </Suspense>
    );
}
