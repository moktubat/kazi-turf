import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { Reveal } from "./Reveal";

export type SectionTone = "surface" | "canvas" | "mint" | "dark";

const toneBg: Record<SectionTone, string> = {
    surface: "bg-surface",
    canvas: "bg-canvas",
    mint: "bg-mint/70",
    dark: "bg-evergreen text-surface",
};

export function Section({
    id,
    title,
    intro,
    eyebrow,
    tone = "surface",
    action,
    children,
}: {
    id: string;
    title: string;
    intro?: string;
    eyebrow?: string;
    tone?: SectionTone;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    const dark = tone === "dark";
    return (
        <section
            id={id}
            aria-labelledby={`${id}-title`}
            className={cn(
                "py-14 md:py-20",
                toneBg[tone],
                // Hairline between neighbouring light sections so close shades still read as separate bands.
                !dark && "border-t border-evergreen/10"
            )}
        >
            <Reveal className="mx-auto max-w-main px-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        {eyebrow && (
                            <p
                                className={cn(
                                    "mb-2 flex items-center gap-3 font-heading text-xs font-bold uppercase tracking-[0.18em]",
                                    dark ? "text-emerald" : "text-teal"
                                )}
                            >
                                <span aria-hidden className={cn("h-0.5 w-8", dark ? "bg-emerald" : "bg-teal")} />
                                {eyebrow}
                            </p>
                        )}
                        <h2
                            id={`${id}-title`}
                            className={cn(
                                "text-3xl font-extrabold uppercase tracking-tight md:text-5xl",
                                dark && "text-surface"
                            )}
                        >
                            {title}
                        </h2>
                        {intro && (
                            <p className={cn("mt-2 max-w-2xl", dark ? "text-surface/75" : "text-evergreen/80")}>{intro}</p>
                        )}
                    </div>
                    {action}
                </div>
                <div className="mt-8">
                    <Suspense fallback={null}>{children}</Suspense>
                </div>
            </Reveal>
        </section>
    );
}