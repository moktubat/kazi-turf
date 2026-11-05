import Link from "next/link";
import { Accordion } from "@/components/ui/Accordion";
import { faqItems } from "@/data/faq";
import { Section } from "./Section";

export function FaqSection() {
    return (
        <Section id="faq" eyebrow="Good to know" title="FAQ & rules" tone="mint">
            <div className="mx-auto max-w-3xl">
                <Accordion
                    items={faqItems.map((i) => ({
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
        </Section>
    );
}