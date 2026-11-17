// Home page FAQ: six questions, each answer 25–28 words. Built from the LIVE booking policies
// (Admin › Setup › Policies), so numbers never go stale; numbers are single words, so the
// word count holds whatever the values are. Answers describe only what the app actually does.
import { site } from "@/data/site";
import type { Policies } from "@/types";

export interface FaqItem {
    id: string;
    question: string;
    answer: string;
    link?: { label: string; href: string };
}

export function getFaqItems(policies: Policies): FaqItem[] {
    const night = policies.nightAdvancePercent ?? 100;
    return [
        {
            id: "open-24-7",
            question: "Are you open 24 hours?",
            answer: `Yes. ${site.name} is open 24 hours, every day, including weekends. You can book any open football, cricket or badminton slot up to ${policies.bookingHorizonDays} days ahead.`,
            link: { label: "See open slots", href: "/book" },
        },
        {
            id: "how-book",
            question: "How do I book a slot?",
            answer:
                "Choose a sport, date and open slot on the booking page, then sign in and pay the advance with bKash. You will see the full price first.",
            link: { label: "Book a slot", href: "/book" },
        },
        {
            id: "advance",
            question: "How much do I pay online?",
            answer: `You pay a ${policies.advancePercent}% advance with bKash and the rest in cash at the arena. Slots starting between 12 AM and 6 AM need a ${night}% advance.`,
        },
        {
            id: "confirmed",
            question: "How do I know my booking is confirmed?",
            answer:
                "Only after we verify your advance with bKash. Your booking code and status then appear in your account, and we email you a confirmation with the details.",
            link: { label: "Go to my account", href: "/account" },
        },
        {
            id: "cancel",
            question: "Can I cancel or get a refund?",
            answer:
                "Open the booking in your account and send a cancellation request with a short reason. Our team reviews it and contacts you; refunds follow our refund policy.",
            link: { label: "Read the refund policy", href: "/legal#refund" },
        },
        {
            id: "location",
            question: "Where are you, and how can I contact you?",
            answer: `We are in ${site.address.area}, ${site.address.city}, ${site.address.country}. Call ${site.phone}, message us on WhatsApp or email ${site.email}. Directions are on the map in the contact section below.`,
            link: { label: "Get directions", href: "/#contact" },
        },
    ];
}
