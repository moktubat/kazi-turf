import { Check } from "lucide-react";
import { houseRules } from "@/data/home";
import { getBranchPitches } from "@/server/availability";
import type { Branch } from "@/types";
import { PitchCard } from "./PitchCard";
import { SportPitchTabs, type SportGroup } from "./SportPitchTabs";

const grid = "grid gap-6 md:grid-cols-2 lg:grid-cols-3";

export function VenuePanel({ venue }: { venue: Branch }) {
    const pitches = getBranchPitches(venue.id);

    const configs = (venue.sportConfigs ?? []).filter((s) => s.active);

    if (configs.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-evergreen/20 bg-surface p-8 text-center">
                <p className="font-semibold text-evergreen">No sports configured yet</p>
                <p className="mt-1 text-sm text-evergreen/70">
                    Add sports from the admin setup to see them here.
                </p>
            </div>
        );
    }

    const groups: SportGroup[] = configs.map((s) => {
        const list = pitches.filter((p) => p.sport === s.name);
        return {
            id: s.id,
            name: s.name,
            count: list.length,
            content:
                list.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-evergreen/20 bg-surface p-6 text-sm text-evergreen/80">
                        No fields for {s.name} yet. Add a field in admin setup to enable bookings.
                    </p>
                ) : (
                    <div className={grid}>
                        {list.map((p) => (
                            <PitchCard key={p.id} pitch={p} />
                        ))}
                    </div>
                ),
        };
    });

    return (
        <div className="space-y-10">
            {groups.length > 1 ? (
                <SportPitchTabs groups={groups} />
            ) : (
                groups[0]?.content
            )}

            {houseRules.length > 0 && (
                <div className="rounded-2xl border border-evergreen/10 bg-surface p-5 shadow-sm md:p-6">
                    <h4 className="font-heading font-bold">House rules</h4>
                    <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
                        {houseRules.map((r) => (
                            <li key={r} className="flex items-start gap-2">
                                <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-teal" /> {r}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}