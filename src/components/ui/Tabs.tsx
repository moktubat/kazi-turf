"use client";
import { useRef } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
    id: string;
    label: string;
}

/**
 * Accessible tab list (arrow keys, Home/End). Render your own
 * <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}> below.
 */
export function Tabs({
    items,
    value,
    onChange,
    label,
    className,
}: {
    items: TabItem[];
    value: string;
    onChange: (id: string) => void;
    label: string;
    className?: string;
}) {
    const refs = useRef<Record<string, HTMLButtonElement | null>>({});

    function onKeyDown(e: React.KeyboardEvent, index: number) {
        let next = index;
        if (e.key === "ArrowRight") next = (index + 1) % items.length;
        else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = items.length - 1;
        else return;
        e.preventDefault();
        const id = items[next].id;
        onChange(id);
        refs.current[id]?.focus();
    }

    return (
        <div
            role="tablist"
            aria-label={label}
            className={cn("flex gap-2 overflow-x-auto pb-1", className)}
        >
            {items.map((t, i) => {
                const selected = t.id === value;
                return (
                    <button
                        key={t.id}
                        ref={(el) => {
                            refs.current[t.id] = el;
                        }}
                        role="tab"
                        id={`tab-${t.id}`}
                        aria-selected={selected}
                        aria-controls={`panel-${t.id}`}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(t.id)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        className={cn(
                            "min-h-11 shrink-0 rounded-full px-5 text-sm font-semibold font-heading transition-colors",
                            selected ? "bg-teal text-white" : "bg-mint text-evergreen hover:bg-emerald/40"
                        )}
                    >
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}