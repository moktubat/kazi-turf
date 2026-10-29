import { cn } from "@/lib/cn";

export type Tone = "success" | "held" | "booked" | "maint" | "info" | "neutral";

const tones: Record<Tone, string> = {
    success: "bg-emerald/25 text-evergreen",
    held: "bg-held-soft text-held",
    booked: "bg-booked-soft text-booked",
    maint: "bg-maint-soft text-maint",
    info: "bg-mint text-teal",
    neutral: "bg-evergreen/5 text-evergreen",
};

export function Badge({
    tone = "neutral",
    className,
    children,
}: {
    tone?: Tone;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                tones[tone],
                className
            )}
        >
            {children}
        </span>
    );
}