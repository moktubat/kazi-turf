import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { LegalTabs } from "@/components/pages/legal/LegalTabs";
import { getLegalDocs, legalStatus } from "@/data/legal";
import { getPublicRefundPolicy } from "@/server/public-data";

export const metadata: Metadata = { title: "Terms, Privacy & Refund policy" };

export default async function LegalPage() {
    const refundPolicy = await getPublicRefundPolicy();

    return (
        <>
            <div className="bg-evergreen text-white">
                <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
                    <p className="mb-2 font-heading text-xs font-bold uppercase tracking-[0.18em] text-emerald">
                        Policies
                    </p>
                    <h1 className="text-3xl font-extrabold text-white md:text-5xl">Legal</h1>
                    <p className="mt-2 max-w-xl text-white/75">
                        Terms, privacy and our refund policy.
                    </p>

                    {!legalStatus.reviewed && (
                        <p
                            role="note"
                            className="mt-5 flex items-start gap-2 rounded-xl bg-held-soft p-3 text-sm font-medium text-held"
                        >
                            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
                            These documents are being finalised and may change before launch.
                        </p>
                    )}
                </div>
            </div>

            <div className="mx-auto max-w-3xl px-4 py-8 pb-16">
                <LegalTabs docs={getLegalDocs()} refundPolicy={refundPolicy} />
            </div>
        </>
    );
}