"use client";
import { useState } from "react";
import { CircleDot, Feather, Goal, Target, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SportGroup {
    id: string;
    name: string;
    count: number;
    content: React.ReactNode;
}

function iconFor(name: string): React.ElementType {
    const n = name.toLowerCase();
    if (n.includes("football") || n.includes("futsal")) return Goal;
    if (n.includes("cricket")) return Target;
    if (n.includes("badminton")) return Feather;
    if (n.includes("basket")) return CircleDot;
    return Trophy;
}

export function SportPitchTabs({ groups }: { groups: SportGroup[] }) {
    const [active, setActive] = useState(groups[0]?.id ?? "");

    return (
        <div className="space-y-6">
            <div
                role="group"
                aria-label="Browse by sport"
                className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
            >
                {groups.map((g) => {
                    const Icon = iconFor(g.name);
                    const selected = g.id === active;
                    return (
                        <button
                            key={g.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setActive(g.id)}
                            className={cn(
                                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                                selected
                                    ? "border-evergreen bg-evergreen text-white shadow-sm"
                                    : "border-evergreen/15 bg-surface text-evergreen hover:border-teal"
                            )}
                        >
                            <Icon size={16} aria-hidden className={selected ? "text-emerald" : "text-teal"} />
                            {g.name}
                            <span
                                className={cn(
                                    "rounded-full px-1.5 text-xs font-bold",
                                    selected ? "bg-white/15 text-white" : "bg-mint text-teal"
                                )}
                            >
                                {g.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {groups.map((g) => (
                <div key={g.id} hidden={g.id !== active}>
                    {g.content}
                </div>
            ))}
        </div>
    );
}