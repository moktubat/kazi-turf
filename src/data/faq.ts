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
            "Pick a sport and date, choose a slot, then pay the advance with bKash. You can browse and select slots without logging in. You sign in at the payment step.",
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
        answer: `Show your booking code to staff. Check-in opens ${policies.checkInOpensMinutesBefore} minutes before your slot starts and stays open until it ends. Staff may ask for the last digits of your phone number.`,
    },
    {
        id: "what-rain",
        question: "What happens if it rains?",
        answer:
            "Weather alone does not automatically mean a refund. Rain-check eligibility and expiry are set out in our policy.",
        link: { label: "Read the rain-check policy", href: "/legal#refund" },
    },
];