"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { formatDateShort } from "@/lib/format";

export function DateStrip({
    dates,
    value,
    today,
    onChange,
}: {
    dates: string[];
    value: string;
    today: string;
    onChange: (date: string) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        ref.current
            ?.querySelector<HTMLElement>('[aria-pressed="true"]')
            ?.scrollIntoView({ inline: "center", block: "nearest" });
    }, [value]);

    return (
        <div ref={ref} role="group" aria-label="Choose a date" className="flex gap-2 overflow-x-auto pb-2">
            {dates.map((d) => {
                const p = formatDateShort(d);
                const selected = d === value;
                return (
                    <button
                        key={d}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${p.weekday} ${p.day} ${p.month}${d === today ? ", today" : ""}`}
                        onClick={() => onChange(d)}
                        className={cn(
                            "flex min-h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border-2 px-2 py-1",
                            selected
                                ? "border-teal bg-teal text-white"
                                : "border-evergreen/15 bg-white hover:border-teal"
                        )}
                    >
                        <span className="text-xs font-semibold uppercase">{d === today ? "Today" : p.weekday}</span>
                        <span className="font-heading text-lg font-extrabold leading-none">{p.day}</span>
                        <span className="text-xs">{p.month}</span>
                    </button>
                );
            })}
        </div>
    );
}