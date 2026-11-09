import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Section } from "./Section";
import type { Policies } from "@/types";

const FAQ_IMAGE = "/sports/faqImg.webp";

export function FaqSection({ policies }: { policies: Policies }) {
    const faqItems = [
        {
            id: "how-book",
            question: "How do I book a slot?",
            answer:
                "Choose a sport, date, and slot, then pay the advance with bKash. No login is needed until payment.",
            link: { label: "Start booking", href: "/book" },
        },
        {
            id: "how-much",
            question: "How much do I pay online?",
            answer: `You pay a ${policies.advancePercent}% advance through bKash. The balance is paid in cash at the venue.`,
        },
        {
            id: "how-long-held",
            question: "How long is my slot held while I pay?",
            answer: `Your slot is held for ${policies.holdMinutes} minutes. If payment is not completed in that time, the slot is released.`,
        },
        {
            id: "how-checkin",
            question: "How does check-in work?",
            answer: `Show your booking code to staff. Check-in opens ${policies.checkInOpensMinutesBefore} minutes before your slot starts and closes when it ends.`,
        },
        {
            id: "what-rain",
            question: "What happens if it rains?",
            answer:
                "Weather alone does not automatically mean a refund. Rain-check eligibility and expiry are set out in our policy.",
            link: { label: "Read the rain-check policy", href: "/legal#refund" },
        },
        {
            id: "how-cancel",
            question: "Can I cancel my booking?",
            answer:
                "You can request cancellation according to our policy. Refund eligibility and conditions are explained there.",
            link: { label: "Read the cancellation policy", href: "/legal#refund" },
        },
        {
            id: "how-confirm",
            question: "How do I know my booking is confirmed?",
            answer:
                "Your booking is confirmed once the advance payment is successful. You can view your booking details and code from your account after signing in.",
        },
    ];

    return (
        <Section id="faq" eyebrow="Good to know" title="FAQ & rules">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
                <div className="relative h-60 overflow-hidden rounded-3xl bg-evergreen shadow-lift lg:sticky lg:top-24 lg:h-[30rem] lg:self-start">
                    <Image
                        src={FAQ_IMAGE}
                        alt="KaziTurf venue"
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
                        <p className="mt-1 text-sm text-white/85">Our team usually replies the same day.</p>
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