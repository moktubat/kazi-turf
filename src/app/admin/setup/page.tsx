import type { Metadata } from "next";
import { connection } from "next/server";

import { requireSetupPage } from "@/server/auth/pageGuards";
import { SetupView } from "@/components/pages/admin/setup/SetupView";
import { getSetupData } from "@/server/admin/setup";

export const metadata: Metadata = { title: "Setup" };

export default async function SetupPage() {
    await connection();

    const user = await requireSetupPage("/admin/setup");
    const setupData = await getSetupData(user, new Date());

    return (
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">
                Setup
            </h1>

            <SetupView data={setupData} />
        </div>
    );
}