import { CalendarCheck, Wallet, Ticket } from "lucide-react";
import { getHowSteps } from "@/data/home";
import { Section } from "./Section";

const icons = { calendar: CalendarCheck, wallet: Wallet, ticket: Ticket };

export function HowItWorks() {
    return (
        <Section id="how" title="How it works" tone="mint">
            <ol className="grid gap-6 md:grid-cols-3">
                {getHowSteps().map((s, i) => {
                    const Icon = icons[s.icon];
                    return (
                        <li key={s.id} className="rounded-2xl border border-evergreen/10 bg-white p-6">
                            <div className="flex items-center gap-3">
                                <span className="inline-flex size-12 items-center justify-center rounded-xl bg-teal text-white">
                                    <Icon size={24} aria-hidden />
                                </span>
                                <span className="font-heading text-sm font-bold text-teal">Step {i + 1}</span>
                            </div>
                            <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                            <p className="mt-1 text-sm text-evergreen/80">{s.text}</p>
                        </li>
                    );
                })}
            </ol>
        </Section>
    );
}