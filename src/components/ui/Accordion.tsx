"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AccordionItem {
    id: string;
    question: string;
    answer: React.ReactNode;
}

export function Accordion({ items }: { items: AccordionItem[] }) {
    const [open, setOpen] = useState<string | null>(null);

    return (
        <div className="divide-y divide-evergreen/10 rounded-2xl border border-evergreen/10 bg-white">
            {items.map((item) => {
                const isOpen = open === item.id;
                return (
                    <div key={item.id}>
                        <h3>
                            <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={`acc-${item.id}`}
                                id={`acc-btn-${item.id}`}
                                onClick={() => setOpen(isOpen ? null : item.id)}
                                className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-3 text-left font-heading text-base font-semibold"
                            >
                                {item.question}
                                <ChevronDown
                                    size={20}
                                    aria-hidden
                                    className={cn("shrink-0 transition-transform", isOpen && "rotate-180")}
                                />
                            </button>
                        </h3>
                        <div
                            id={`acc-${item.id}`}
                            role="region"
                            aria-labelledby={`acc-btn-${item.id}`}
                            hidden={!isOpen}
                            className="px-5 pb-5 text-sm leading-relaxed text-evergreen/85"
                        >
                            {item.answer}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}