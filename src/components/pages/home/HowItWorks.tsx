import { Section } from "./Section";
import { HowSteps, type StepView } from "./HowSteps";
import type { Policies } from "@/types";

export function HowItWorks({ policies }: { policies: Policies }) {
    // FIX: type the array as StepView[] so icon is "calendar" | "wallet" | "ticket", not string
    const steps: StepView[] = [
        {
            id: "pick",
            icon: "calendar",
            title: "Pick your slot",
            text: "Choose your sport, date and time, any hour of the day. You see the price and live availability before you book.",
        },
        {
            id: "pay",
            icon: "wallet",
            title: "Pay the advance",
            text: `Pay a ${policies.advancePercent}% advance through bKash to confirm your booking${(policies.nightAdvancePercent ?? 100) !== policies.advancePercent ? ` (${policies.nightAdvancePercent ?? 100}% for slots from 12 AM to 6 AM)` : ""}.`,
        },
        {
            id: "play",
            icon: "ticket",
            title: "Play at the arena",
            text: "Show your booking code at the counter, pay any balance in cash, and play.",
        },
    ];

    return (
        <Section id="how" eyebrow="Three steps" title="How it works" tone="dark">
            <HowSteps steps={steps} />
        </Section>
    );
}