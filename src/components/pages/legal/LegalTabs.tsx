"use client";
import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import type { LegalDoc, LegalTab } from "@/data/legal";

export function LegalTabs({ docs }: { docs: LegalDoc[] }) {
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
                className="mt-6 rounded-2xl border border-evergreen/10 bg-white p-5 md:p-8"
            >
                <h2 className="text-xl font-extrabold md:text-2xl">{doc.label}</h2>
                <p className="mt-1 text-evergreen/80">{doc.intro}</p>

                <div className="mt-6 space-y-6">
                    {doc.sections.map((s) => (
                        <section key={s.heading} aria-label={s.heading}>
                            <h3 className="text-base font-bold md:text-lg">{s.heading}</h3>
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