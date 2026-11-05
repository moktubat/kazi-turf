import { CalendarCheck, Wallet, Ticket } from "lucide-react";
import { getHowSteps } from "@/data/home";
import { Section } from "./Section";

const icons = { calendar: CalendarCheck, wallet: Wallet, ticket: Ticket };

export function HowItWorks() {
    return (
        <Section id="how" eyebrow="Three steps" title="How it works" tone="dark">
            <ol className="grid gap-5 md:grid-cols-3">
                {getHowSteps().map((s, i) => {
                    const Icon = icons[s.icon];
                    return (
                        <li
                            key={s.id}
                            className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors hover:bg-white/10"
                        >
                            <span
                                aria-hidden
                                className="absolute right-4 top-2 font-heading text-6xl font-extrabold text-white/10"
                            >
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="inline-flex size-12 items-center justify-center rounded-xl bg-emerald text-evergreen">
                                <Icon size={24} aria-hidden />
                            </span>
                            <p className="mt-4 font-heading text-xs font-bold uppercase tracking-wide text-emerald">
                                Step {i + 1}
                            </p>
                            <h3 className="mt-1 text-lg font-bold text-white">{s.title}</h3>
                            <p className="mt-1 text-sm text-white/75">{s.text}</p>
                        </li>
                    );
                })}
            </ol>
        </Section>
    );
}