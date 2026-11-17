import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Section } from "./Section";
import { getFaqItems } from "@/data/faq";
import { site } from "@/data/site";
import type { Policies } from "@/types";

const FAQ_IMAGE = "/sports/faqImg.webp";

export function FaqSection({ policies }: { policies: Policies }) {
    const faqItems = getFaqItems(policies);

    return (
        <Section id="faq" eyebrow="Good to know" title="Frequently asked questions">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
                <div className="relative h-60 overflow-hidden rounded-3xl bg-evergreen shadow-lift lg:sticky lg:top-24 lg:h-[30rem] lg:self-start">
                    <Image
                        src={FAQ_IMAGE}
                        alt={`Inside ${site.name}`}
                        fill
                        sizes="(min-width: 1024px) 40vw, 100vw"
                        className="object-cover"
                        loading="lazy"
                    />
                    <div
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-t from-evergreen/90 via-evergreen/30 to-transparent"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                        <p className="font-heading text-2xl font-extrabold">Still have questions?</p>
                        <p className="mt-1 text-sm text-white/85">Call us, send a WhatsApp message or use the contact form.</p>
                        <Link
                            href="#contact"
                            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald px-4 text-sm font-bold text-evergreen transition-colors hover:bg-mint"
                        >
                            Contact us <ArrowRight size={16} aria-hidden />
                        </Link>
                    </div>
                </div>

                <Accordion
                    alwaysOpen
                    defaultOpenId={faqItems[0]?.id}
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