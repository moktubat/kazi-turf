import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const steps = ["Choose", "Confirm & Pay", "Result"];

// Designed for the dark title band at the top of /book.
export function Stepper({ step }: { step: 1 | 2 | 3 }) {
    return (
        <ol aria-label="Booking progress" className="flex items-center gap-2 text-sm">
            {steps.map((label, i) => {
                const n = i + 1;
                const done = n < step;
                const current = n === step;
                return (
                    <li
                        key={label}
                        aria-current={current ? "step" : undefined}
                        className="flex items-center gap-2"
                    >
                        <span
                            className={cn(
                                "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold",
                                done && "bg-emerald text-evergreen",
                                current && "bg-surface text-evergreen",
                                !done && !current && "bg-surface/15 text-white/80"
                            )}
                        >
                            {done ? <Check size={14} aria-hidden /> : n}
                        </span>
                        <span className={cn("font-semibold text-white", !current && "hidden text-white/70 sm:inline")}>
                            {label}
                        </span>
                        {n < steps.length && <span aria-hidden className="h-px w-6 bg-surface/25 sm:w-10" />}
                    </li>
                );
            })}
        </ol>
    );
}