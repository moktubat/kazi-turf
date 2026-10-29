// Answers that depend on policy read from src/data/site.ts so they never drift.
// Cancellation / rain-check wording points to /legal until the owner approves terms [CONFIRM].
import { policies } from "@/data/site";

export interface FaqItem {
    id: string;
    question: string;
    answer: string;
    link?: { label: string; href: string };
}

export interface FaqGroup {
    id: string;
    title: string;
    items: FaqItem[];
}

export const faqGroups: FaqGroup[] = [
    {
        id: "booking",
        title: "Booking and payment",
        items: [
            {
                id: "b-how",
                question: "How do I book a slot?",
                answer:
                    "Choose a branch, sport and date, pick a slot, then pay the advance with bKash. You can browse and select slots without logging in. You sign in at the payment step.",
                link: { label: "Start booking", href: "/book" },
            },
            {
                id: "b-advance",
                question: "How much do I pay online?",
                answer: `You pay a ${policies.advancePercent}% advance through bKash. The balance is paid at the venue.`,
            },
            {
                id: "b-hold",
                question: "How long is my slot held while I pay?",
                answer: `Your slot is held for ${policies.holdMinutes} minutes. If payment is not completed in that time, the slot is released.`,
            },
            {
                id: "b-pay-methods",
                question: "Which payment methods are accepted?",
                answer:
                    "The advance is paid online with bKash. The balance is paid in cash at the venue.",
            },
        ],
    },
    {
        id: "cancel",
        title: "Cancellation and rescheduling",
        items: [
            {
                id: "c-cancel",
                question: "Can I cancel or reschedule?",
                answer:
                    "You can request a cancellation or reschedule from your account. What happens to your advance depends on how far ahead you ask.",
                link: { label: "Read the refund policy", href: "/legal#refund" },
            },
        ],
    },
    {
        id: "rain",
        title: "Rain-check",
        items: [
            {
                id: "r-rain",
                question: "What happens if it rains?",
                answer:
                    "Weather alone does not automatically mean a refund. Rain-check eligibility and expiry are set out in our policy.",
                link: { label: "Read the rain-check policy", href: "/legal#refund" },
            },
        ],
    },
    {
        id: "arrival",
        title: "Arrival and check-in",
        items: [
            {
                id: "a-checkin",
                question: "How does check-in work?",
                answer: `Show your booking code to staff. Check-in opens ${policies.checkInOpensMinutesBefore} minutes before your slot starts and stays open until it ends. Staff may ask for the last digits of your phone number.`,
            },
            {
                id: "a-late",
                question: "What if I arrive late?",
                answer:
                    "Slots run on a fixed schedule and end at their booked time, so arriving late shortens your playing time.",
            },
        ],
    },
    {
        id: "rules",
        title: "Rules",
        items: [
            {
                id: "ru-rules",
                question: "What are the house rules?",
                answer:
                    "Turf-safe footwear, respect for staff and other players, and following staff instructions. The full checklist is in the Venues section.",
                link: { label: "See venues and rules", href: "/#venues" },
            },
        ],
    },
];