import type { Metadata } from "next";
import { requireSetupPage } from "@/server/auth/pageGuards";
import { SetupView } from "@/components/pages/admin/setup/SetupView";
import { getSetupData } from "@/server/admin/setup";

export const metadata: Metadata = { title: "Setup" };

export default async function SetupPage() {
    const user = await requireSetupPage("/admin/setup");
    return (
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Setup</h1>
            <SetupView data={await getSetupData(user)} />
        </div>
    );
}