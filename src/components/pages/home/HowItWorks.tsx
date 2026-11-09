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
            text: "Choose your sport, date and time. Check the price and availability before booking.",
        },
        {
            id: "pay",
            icon: "wallet",
            title: "Pay the advance",
            text: `Pay ${policies.advancePercent}% of the total price through bKash to confirm and secure your booking.`,
        },
        {
            id: "play",
            icon: "ticket",
            title: "Confirm at the venue",
            text: "Show your booking code to staff and pay the remaining balance in cash.",
        },
    ];

    return (
        <Section id="how" eyebrow="Three steps" title="How it works" tone="dark">
            <HowSteps steps={steps} />
        </Section>
    );
}