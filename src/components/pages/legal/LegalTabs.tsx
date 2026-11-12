"use client";
import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import type { LegalDoc, LegalTab } from "@/data/legal";

type RefundPolicy = {
    tiers: { when: string; outcome: string }[];
    method: string;
    timing: string;
    exceptions: string[];
};

export function LegalTabs({
    docs,
    refundPolicy,
}: {
    docs: LegalDoc[];
    refundPolicy: RefundPolicy;
}) {
    const [tab, setTab] = useState<LegalTab>(docs[0].id);

    // /legal#terms | #privacy | #refund open the matching tab.
    useEffect(() => {
        const read = () => {
            const h = window.location.hash.slice(1);
            const match = docs.find((d) => d.id === h);
            if (match) setTab(match.id);
        };
        read();
        window.addEventListener("hashchange", read);
        return () => window.removeEventListener("hashchange", read);
    }, [docs]);

    function change(id: string) {
        setTab(id as LegalTab);
        window.history.replaceState(null, "", `#${id}`);
    }

    const doc = docs.find((d) => d.id === tab) ?? docs[0];
    const isRefundTab = doc.id === "refund";

    // Build dynamic refund content from the admin-saved policy
    const refundSections = buildRefundSections(refundPolicy);

    return (
        <>
            <Tabs
                label="Legal documents"
                items={docs.map((d) => ({ id: d.id, label: d.label }))}
                value={doc.id}
                onChange={change}
            />
            <div
                role="tabpanel"
                id={`panel-${doc.id}`}
                aria-labelledby={`tab-${doc.id}`}
                tabIndex={0}
                className="mt-6 rounded-2xl border border-evergreen/10 bg-surface p-5 shadow-sm md:p-8"
            >
                <h2 className="text-xl font-extrabold md:text-2xl">{doc.label}</h2>
                <p className="mt-1 text-evergreen/80">
                    {isRefundTab ? refundIntro(refundPolicy) : doc.intro}
                </p>

                <div className="mt-6 space-y-6">
                    {(isRefundTab ? refundSections : doc.sections).map((s, i) => (
                        <section
                            key={s.heading}
                            aria-label={s.heading}
                            className="border-t border-evergreen/10 pt-6 first:border-t-0 first:pt-0"
                        >
                            <h3 className="flex items-baseline gap-3 text-base font-bold md:text-lg">
                                <span aria-hidden className="font-heading text-sm font-extrabold text-teal">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                {s.heading}
                            </h3>
                            {s.paragraphs?.map((p) => (
                                <p key={p} className="mt-2 text-sm leading-relaxed text-evergreen/90">
                                    {p}
                                </p>
                            ))}
                            {s.bullets && (
                                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-evergreen/90">
                                    {s.bullets.map((b) => (
                                        <li key={b}>{b}</li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    ))}
                </div>
            </div>
        </>
    );
}

function refundIntro(p: RefundPolicy): string {
    const hasContent =
        p.tiers.length > 0 || p.method || p.timing || p.exceptions.length > 0;
    return hasContent
        ? "All turfs are indoor — weather is never a reason for a refund. The windows below describe what happens to your advance if you cancel."
        : "Our refund policy is being finalised. Please contact the venue for cancellation and refund details.";
}

function buildRefundSections(p: RefundPolicy): LegalDoc["sections"] {
    const hasContent =
        p.tiers.length > 0 || p.method || p.timing || p.exceptions.length > 0;
    if (!hasContent) {
        return [
            {
                heading: "Refund policy",
                paragraphs: [
                    "Our refund policy is being finalised. Please contact the venue for cancellation and refund details.",
                ],
            },
        ];
    }

    const sections: LegalDoc["sections"] = [];

    if (p.tiers.length > 0) {
        sections.push({
            heading: "Cancellation windows",
            paragraphs: [
                "The amount of your advance that is refunded depends on how far in advance you cancel:",
            ],
            bullets: p.tiers.map((t) => `${t.when}: ${t.outcome}`),
        });
    }

    if (p.method) {
        sections.push({
            heading: "Refund method",
            paragraphs: [p.method],
        });
    }

    if (p.timing) {
        sections.push({
            heading: "Refund timing",
            paragraphs: [p.timing],
        });
    }

    if (p.exceptions.length > 0) {
        sections.push({
            heading: "Exceptions",
            bullets: p.exceptions,
        });
    }

    sections.push({
        heading: "Disputes",
        paragraphs: [
            "If you have a dispute about a refund, please contact the venue directly. Last-minute cancellations where the slot cannot be rebooked may not receive a full refund of the advance.",
        ],
    });

    return sections;
}