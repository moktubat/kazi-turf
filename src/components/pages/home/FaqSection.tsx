import Link from "next/link";
import { Accordion } from "@/components/ui/Accordion";
import { faqGroups } from "@/data/faq";
import { Section } from "./Section";

export function FaqSection() {
    return (
        <Section id="faq" title="FAQ & rules" tone="mint">
            <div className="space-y-8">
                {faqGroups.map((g) => (
                    <div key={g.id}>
                        <h3 className="mb-3 text-lg font-bold">{g.title}</h3>
                        <Accordion
                            items={g.items.map((i) => ({
                                id: i.id,
                                question: i.question,
                                answer: (
                                    <>
                                        {i.answer}
                                        {i.link && (
                                            <>
                                                {" "}
                                                <Link href={i.link.href} className="font-semibold text-teal underline underline-offset-2">
                                                    {i.link.label}
                                                </Link>
                                            </>
                                        )}
                                    </>
                                ),
                            }))}
                        />
                    </div>
                ))}
            </div>
        </Section>
    );
}