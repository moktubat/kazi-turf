import { getHowSteps } from "@/data/home";
import { Section } from "./Section";
import { HowSteps } from "./HowSteps";

export function HowItWorks() {
    const steps = getHowSteps().map((s) => ({
        id: s.id,
        title: s.title,
        text: s.text,
        icon: s.icon,
    }));

    return (
        <Section id="how" eyebrow="Three steps" title="How it works" tone="dark">
            <HowSteps steps={steps} />
        </Section>
    );
}