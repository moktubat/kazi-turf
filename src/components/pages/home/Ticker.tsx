import type { Branch, Policies } from "@/types";

export function Ticker({
    venue,
    policies,
}: {
    venue: Branch;       // ← now passed as prop
    policies: Policies;  // ← now passed as prop
}) {
    const sports = (venue.sportConfigs ?? []).filter((s) => s.active).map((s) => s.name);
    const items = [
        ...sports,
        "Live slot availability",
        `${policies.advancePercent}% bKash advance`,
        "Balance paid at the venue",
        `${policies.holdMinutes}-minute slot hold`,
    ];

    return (
        <div aria-label="Highlights" className="overflow-hidden bg-emerald text-evergreen">
            <ul className="marquee-track flex whitespace-nowrap py-3.5">
                {[...items, ...items].map((text, i) => (
                    <li
                        key={i}
                        aria-hidden={i >= items.length}
                        className="flex items-center font-heading text-sm font-extrabold uppercase tracking-wide md:text-base"
                    >
                        <span className="px-6">{text}</span>
                        <span aria-hidden className="size-2 rounded-full bg-evergreen/60" />
                    </li>
                ))}
            </ul>
        </div>
    );
}