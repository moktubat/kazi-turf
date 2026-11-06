import { policies } from "@/data/site";

export interface FaqItem {
    id: string;
    question: string;
    answer: string;
    link?: { label: string; href: string };
}

export const faqItems: FaqItem[] = [
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
        answer: `Show your booking code to staff. Check-in opens before your slot starts and closes when it ends.`,
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