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
        question: "How do I book a slot at Kazi Sports Arena?",
        answer:
            "Choose your sport (football, cricket, or badminton), pick a date and time slot, then pay the advance with bKash. Your slot is held for 10 minutes while you pay. No login is needed until payment.",
        link: { label: "Start booking", href: "/book" },
    },
    {
        id: "how-much",
        question: "How much do I pay online?",
        answer: `You pay a ${policies.advancePercent}% advance through bKash. The remaining balance is paid in cash at the venue. Night slots (12 AM–6 AM) require 100% advance.`,
    },
    {
        id: "how-long-held",
        question: "How long is my slot held while I pay?",
        answer: `Your slot is held for ${policies.holdMinutes} minutes. If payment is not completed in that time, the slot is released and someone else can book it.`,
    },
    {
        id: "how-checkin",
        question: "How does check-in work?",
        answer: `Show your booking code to our staff at the venue. Check-in opens ${policies.checkInOpensMinutesBefore} minutes before your slot starts and stays open until it ends. You can also confirm your identity with the last 4 digits of your booking phone number.`,
    },
    {
        id: "indoor-weather",
        question: "What happens if it rains? Are the courts indoor?",
        answer:
            "Yes — all our courts at Kazi Sports Arena are fully indoor. Weather never affects your booking. Rain or shine, you play on schedule. No rain checks needed.",
    },
    {
        id: "how-cancel",
        question: "Can I cancel or reschedule my booking?",
        answer:
            "Yes. You can request a cancellation or reschedule from your account. Refund eligibility depends on how far ahead you ask. See our refund policy for the exact tiers.",
        link: { label: "Read the cancellation policy", href: "/legal#refund" },
    },
    {
        id: "how-confirm",
        question: "How do I know my booking is confirmed?",
        answer:
            "Your booking is confirmed only after we verify your bKash advance payment with bKash directly. Reaching a success page is not confirmation — we check with bKash's servers before marking your slot as confirmed. You'll see your booking code and status in your account.",
    },
    {
        id: "what-sports",
        question: "What sports can I play at Kazi Sports Arena?",
        answer:
            "We offer indoor football (5-a-side and 6-a-side), cricket (turf wicket and net practice), and badminton. All courts are indoor with floodlights, available 24 hours a day.",
        link: { label: "View our courts", href: "/#venues" },
    },
    {
        id: "what-hours",
        question: "What are your opening hours?",
        answer:
            "Kazi Sports Arena is open 24 hours a day, 7 days a week. Book a slot any time — day or night. Night slots (12 AM–6 AM) require full payment as advance.",
    },
    {
        id: "where-located",
        question: "Where is Kazi Sports Arena located?",
        answer:
            "We're located in Shabgram, Bogura, Bangladesh. You can find us on Google Maps via the contact section below.",
        link: { label: "Get directions", href: "/#contact" },
    },
];