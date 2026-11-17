
import type { Metadata } from "next";
import { site } from "@/data/site";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { AlertTriangle } from "lucide-react";

import { LegalTabs } from "@/components/pages/legal/LegalTabs";
import { getLegalDocs, legalStatus } from "@/data/legal";
import { getPublicRefundPolicy } from "@/server/public-data";

export const metadata: Metadata = pageMetadata({
    path: "/legal",
    title: "Terms, Privacy & Refund Policy",
    description:
        "Booking terms, privacy policy and refund policy for Kazi Sports Arena, Shabgram, Bogura: advance payments by bKash, cancellations, refunds and how we use your data.",
});

function LegalHeader() {
    return (
        <div className="bg-evergreen text-white">
            <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
                <p className="mb-2 font-heading text-xs font-bold uppercase tracking-[0.18em] text-emerald">
                    Policies
                </p>

                <h1 className="text-3xl font-extrabold text-white md:text-5xl">
                    Terms, Privacy &amp; Refund Policy
                </h1>

                <p className="mt-2 max-w-xl text-white/75">
                    The rules for booking at {site.name}, how we handle your information, and what happens to your advance if plans change.
                </p>

                {!legalStatus.reviewed && (
                    <p
                        role="note"
                        className="mt-5 flex items-start gap-2 rounded-xl bg-held-soft p-3 text-sm font-medium text-held"
                    >
                        <AlertTriangle
                            size={18}
                            aria-hidden
                            className="mt-0.5 shrink-0"
                        />
                        These documents are being finalised and may change before launch.
                    </p>
                )}
            </div>
        </div>
    );
}

function LegalFallback() {
    return (
        <div className="mx-auto max-w-3xl px-4 py-8 pb-16">
            <div className="h-12 animate-pulse rounded-xl bg-evergreen/10" />
            <div className="mt-6 h-64 animate-pulse rounded-xl bg-evergreen/5" />
        </div>
    );
}

async function LegalContent() {
    const refundPolicy = await getPublicRefundPolicy();

    return (
        <div className="mx-auto max-w-3xl px-4 py-8 pb-16">
            <LegalTabs docs={getLegalDocs(refundPolicy)} />
        </div>
    );
}

export default function LegalPage() {
    return (
        <>
            <LegalHeader />

            <Suspense fallback={<LegalFallback />}>
                <LegalContent />
            </Suspense>
        </>
    );
}