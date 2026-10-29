import { cn } from "@/lib/cn";
import { Reveal } from "./Reveal";

export function Section({
    id,
    title,
    intro,
    tone = "white",
    children,
}: {
    id: string;
    title: string;
    intro?: string;
    tone?: "white" | "mint";
    children: React.ReactNode;
}) {
    return (
        <section
            id={id}
            aria-labelledby={`${id}-title`}
            className={cn("py-14 md:py-20", tone === "mint" && "bg-mint/50")}
        >
            <Reveal className="mx-auto max-w-6xl px-4">
                <h2 id={`${id}-title`} className="text-2xl font-extrabold md:text-4xl">
                    {title}
                </h2>
                {intro && <p className="mt-2 max-w-2xl text-evergreen/80">{intro}</p>}
                <div className="mt-8">{children}</div>
            </Reveal>
        </section>
    );
}