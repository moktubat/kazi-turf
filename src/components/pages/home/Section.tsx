import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { Reveal } from "./Reveal";

export type SectionTone = "white" | "mint" | "dark";

const toneBg: Record<SectionTone, string> = {
    white: "bg-white",
    mint: "bg-mint/70",
    dark: "bg-evergreen text-white",
};

export function Section({
    id,
    title,
    intro,
    eyebrow,
    tone = "white",
    children,
}: {
    id: string;
    title: string;
    intro?: string;
    eyebrow?: string;
    tone?: SectionTone;
    children: React.ReactNode;
}) {
    const dark = tone === "dark";
    return (
        <section
            id={id}
            aria-labelledby={`${id}-title`}
            className={cn("py-14 md:py-20", toneBg[tone])}
        >
            <Reveal className="mx-auto max-w-6xl px-4">
                {eyebrow && (
                    <p className={cn("mb-2 font-heading text-xs font-bold uppercase tracking-[0.18em]", dark ? "text-emerald" : "text-teal")}>
                        {eyebrow}
                    </p>
                )}
                <h2
                    id={`${id}-title`}
                    className={cn("text-2xl font-extrabold md:text-4xl", dark && "text-white")}
                >
                    {title}
                </h2>
                {intro && (
                    <p className={cn("mt-2 max-w-2xl", dark ? "text-white/75" : "text-evergreen/80")}>{intro}</p>
                )}
                <div className="mt-8">
                    <Suspense fallback={null}>{children}</Suspense>
                </div>
            </Reveal>
        </section>
    );
}