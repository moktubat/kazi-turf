"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { SportConfig } from "@/types";

const SHUFFLE_MS = 5000;

export function SportTabs({
    sports,
    value,
    onChange,
}: {
    sports: SportConfig[];
    value: string;
    onChange: (id: string) => void;
}) {
    const [auto, setAuto] = useState(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!auto || sports.length <= 1) return;

        timerRef.current = setTimeout(() => {
            const idx = sports.findIndex((s) => s.id === value);
            const next = sports[(idx + 1) % sports.length];
            onChange(next.id);
        }, SHUFFLE_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [auto, sports, value, onChange]);

    function handleClick(id: string) {
        setAuto(false);  // user interacted — stop auto-shuffle
        onChange(id);
    }

    return (
        <div
            role="tablist"
            aria-label="Select sport"
            className="flex flex-wrap justify-center gap-2"
        >
            {sports.map((s) => (
                <button
                    key={s.id}
                    role="tab"
                    aria-selected={value === s.id}
                    onClick={() => handleClick(s.id)}
                    className={cn(
                        "rounded-full px-5 py-2 text-sm font-heading font-semibold transition-all sm:px-6 sm:py-2.5",
                        value === s.id
                            ? "bg-white text-evergreen shadow-lg"
                            : "bg-white/10 text-white hover:bg-white/25 backdrop-blur-sm"
                    )}
                >
                    {s.name}
                </button>
            ))}
        </div>
    );
}