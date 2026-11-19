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
            // The advance is set per sport, so no fixed percentage here.
            text: `Pay the advance required for your sport through bKash to confirm your booking. You see the exact amount before you pay, and your slot is held for ${policies.holdMinutes} minutes.`,
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