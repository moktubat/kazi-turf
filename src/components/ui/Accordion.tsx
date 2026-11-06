"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AccordionItem {
    id: string;
    question: string;
    answer: React.ReactNode;
}

export function Accordion({
    items,
    defaultOpenId,
    alwaysOpen = false,
}: {
    items: AccordionItem[];
    /** Item that starts open. */
    defaultOpenId?: string;
    /** When true, one item is always open: clicking the open item does nothing. */
    alwaysOpen?: boolean;
}) {
    const [open, setOpen] = useState<string | null>(defaultOpenId ?? null);

    function toggle(id: string) {
        setOpen((current) => (current === id ? (alwaysOpen ? id : null) : id));
    }

    return (
        // overflow-anchor:none stops the browser from nudging the scroll position while heights animate.
        <div className="divide-y divide-evergreen/10 overflow-hidden rounded-2xl border border-evergreen/10 bg-surface shadow-sm [overflow-anchor:none]">
            {items.map((item) => {
                const isOpen = open === item.id;
                return (
                    <div key={item.id} className={cn("transition-colors duration-300", isOpen && "bg-mint/40")}>
                        <h3>
                            <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={`acc-${item.id}`}
                                id={`acc-btn-${item.id}`}
                                onClick={() => toggle(item.id)}
                                className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-3 text-left font-heading text-base font-semibold"
                            >
                                {item.question}
                                <ChevronDown
                                    size={20}
                                    aria-hidden
                                    className={cn(
                                        "shrink-0 text-teal transition-transform duration-300 ease-premium",
                                        isOpen && "rotate-180"
                                    )}
                                />
                            </button>
                        </h3>

                        {/* grid-rows 0fr -> 1fr animates to the content's real height */}
                        <div
                            id={`acc-${item.id}`}
                            role="region"
                            aria-labelledby={`acc-btn-${item.id}`}
                            inert={!isOpen}
                            className={cn(
                                "grid transition-[grid-template-rows,opacity] duration-300 ease-premium",
                                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                            )}
                        >
                            <div className="overflow-hidden">
                                <div className="px-5 pb-5 text-sm leading-relaxed text-evergreen/85">{item.answer}</div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}