import type { Metadata } from "next";

import { requireSetupPage } from "@/server/auth/pageGuards";
import { SetupView } from "@/components/pages/admin/setup/SetupView";
import { getSetupData } from "@/server/admin/setup";
import type { SetupTab } from "@/types/setup";

export const metadata: Metadata = { title: "Setup" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const VALID_TABS: SetupTab[] = ["venue", "pitches", "rates", "staff", "policies"];

export default async function SetupPage({ searchParams }: { searchParams: Params }) {
    const sp = await searchParams;
    const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
    const initialTab: SetupTab = VALID_TABS.includes(rawTab as SetupTab)
        ? (rawTab as SetupTab)
        : "venue";

    const user = await requireSetupPage("/admin/setup");
    const setupData = await getSetupData(user, new Date());

    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Setup</h1>
            <SetupView data={setupData} initialTab={initialTab} />
        </div>
    );
}