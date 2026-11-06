"use client";
import { useEffect, useRef } from "react";
import { CalendarCheck, Wallet, Ticket } from "lucide-react";

export interface StepView {
    id: string;
    title: string;
    text: string;
    icon: "calendar" | "wallet" | "ticket";
}

const icons = { calendar: CalendarCheck, wallet: Wallet, ticket: Ticket };

export function HowSteps({ steps }: { steps: StepView[] }) {
    const ref = useRef<HTMLOListElement>(null);

    useEffect(() => {
        const root = ref.current;
        if (!root) return;

        let cancelled = false;
        let mm: { revert: () => void } | undefined;

        (async () => {
            const [{ gsap }, { ScrollTrigger }] = await Promise.all([
                import("gsap"),
                import("gsap/ScrollTrigger"),
            ]);
            if (cancelled) return;
            gsap.registerPlugin(ScrollTrigger);

            const media = gsap.matchMedia();
            mm = media;

            media.add(
                {
                    reduce: "(prefers-reduced-motion: reduce)",
                    desktop: "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
                    mobile: "(max-width: 767px) and (prefers-reduced-motion: no-preference)",
                },
                (context) => {
                    if (context.conditions?.reduce) return; // no animation, cards stay visible

                    const desktop = !!context.conditions?.desktop;
                    const items = gsap.utils.toArray<HTMLElement>("[data-step]", root);

                    // One timeline, scrubbed by scroll: the steps appear one after another
                    // as you scroll, and play backwards when you scroll up.
                    const tl = gsap.timeline({
                        defaults: { ease: "power2.out" },
                        scrollTrigger: {
                            trigger: root,
                            start: "top 85%",
                            end: desktop ? "top 20%" : "bottom 55%",
                            scrub: 1.5, // the extra smoothing: animation catches up softly
                        },
                    });

                    items.forEach((el, i) => {
                        tl.fromTo(
                            el,
                            { autoAlpha: 0, y: 70 },
                            { autoAlpha: 1, y: 0, duration: 1.2 },
                            i * 1.1
                        );
                    });
                }
            );
        })();

        return () => {
            cancelled = true;
            mm?.revert();
        };
    }, []);

    return (
        <ol ref={ref} className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => {
                const Icon = icons[s.icon];
                return (
                    <li key={s.id} data-step className="will-change-transform">
                        <div className="group relative flex h-[240px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-6 transition-colors duration-300 hover:border-emerald/40 hover:from-white/15">
                            <span
                                aria-hidden
                                className="absolute right-5 top-2 font-heading text-7xl font-extrabold text-white/[0.07] transition-colors duration-300 group-hover:text-emerald/20"
                            >
                                {String(i + 1).padStart(2, "0")}
                            </span>

                            {/* Icon: top left, centered with the step label */}
                            <div className="relative flex items-center gap-3">
                                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald text-evergreen shadow-lg">
                                    <Icon size={24} aria-hidden />
                                </span>
                                <p className="font-heading text-xs font-bold uppercase tracking-[0.18em] text-emerald">
                                    Step {i + 1}
                                </p>
                            </div>

                            <div className="relative mt-auto pt-5">
                                <h3 className="text-xl font-bold text-white">{s.title}</h3>
                                <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-white/75">
                                    {s.text}
                                </p>
                            </div>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}