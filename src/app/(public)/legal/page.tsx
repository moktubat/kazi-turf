import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { LegalTabs } from "@/components/pages/legal/LegalTabs";
import { getLegalDocs, legalStatus } from "@/data/legal";
import { connectDb } from "@/server/db/connect";

export const metadata: Metadata = { title: "Terms, Privacy & Refund policy" };
export const dynamic = "force-dynamic";

export default async function LegalPage() {
    await connectDb();
    return (
        <div className="mx-auto max-w-3xl px-4 py-10">
            <h1 className="text-2xl font-extrabold md:text-4xl">Legal</h1>
            <p className="mt-2 text-evergreen/80">Terms, privacy and our refund and rain-check policy.</p>

            {!legalStatus.reviewed && (
                <p
                    role="note"
                    className="mt-4 flex items-start gap-2 rounded-xl bg-held-soft p-3 text-sm font-medium text-held"
                >
                    <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
                    These documents are being finalised and may change before launch.
                </p>
            )}

            <div className="mt-6">
                <LegalTabs docs={getLegalDocs()} />
            </div>
        </div>
    );
}