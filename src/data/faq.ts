// Home page FAQ: seven questions, each answer 25–28 words. Built from the LIVE booking policies
// (Admin › Setup › Policies), so numbers never go stale; numbers are single words, so the
// word count holds whatever the values are. Answers describe only what the app actually does.
// The advance is set per sport (Setup → Venue), so answers never state one fixed percentage.
import { site } from "@/data/site";
import type { Policies } from "@/types";

export interface FaqItem {
    id: string;
    question: string;
    answer: string;
    link?: { label: string; href: string };
}

export function getFaqItems(policies: Policies): FaqItem[] {
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
                "Choose a sport, date and open slot on the booking page, then sign in and pay any advance with bKash. You will see the full price first.",
            link: { label: "Book a slot", href: "/book" },
        },
        {
            id: "advance",
            question: "How much do I pay online?",
            answer:
                "It depends on the sport and start time. The booking page shows the bKash advance before you pay, and the rest is paid in cash at the arena.",
            link: { label: "See prices and advance", href: "/book" },
        },
        {
            id: "confirmed",
            question: "How do I know my booking is confirmed?",
            answer:
                "Your booking code and status appear in your account, and we email you a confirmation. Where an advance is due, this happens only after bKash verifies it.",
            link: { label: "Go to my account", href: "/account" },
        },
        {
            id: "payment-failed",
            question: "What if my bKash payment fails?",
            answer:
                "Your booking is not confirmed until bKash verifies the advance. You can try again while your slot is still held; after that, the slot is released for others.",
            link: { label: "Read the payment rules", href: "/legal#refund" },
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
