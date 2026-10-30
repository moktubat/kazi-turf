import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const steps = ["Choose", "Confirm & Pay", "Result"];

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
                                done && "bg-teal text-white",
                                current && "bg-evergreen text-white",
                                !done && !current && "bg-evergreen/10 text-evergreen/70"
                            )}
                        >
                            {done ? <Check size={14} aria-hidden /> : n}
                        </span>
                        <span className={cn("font-semibold", !current && "hidden text-evergreen/70 sm:inline")}>
                            {label}
                        </span>
                        {n < steps.length && <span aria-hidden className="h-px w-6 bg-evergreen/20 sm:w-10" />}
                    </li>
                );
            })}
        </ol>
    );
}