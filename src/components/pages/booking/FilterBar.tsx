"use client";
import { CalendarDays } from "lucide-react";
import { Input, Select } from "@/components/ui/Field";
import { addDays } from "@/lib/time";
import { DateStrip } from "./DateStrip";

export interface FlowBranch {
    id: string;
    name: string;
    address: string;
    mapUrl: string;
    sports: string[];
}

function datesBetween(min: string, max: string) {
    const out: string[] = [];
    for (let d = min; d <= max; d = addDays(d, 1)) out.push(d);
    return out;
}

export function FilterBar({
    branches,
    branchId,
    sport,
    date,
    minDate,
    maxDate,
    onBranch,
    onSport,
    onDate,
}: {
    branches: FlowBranch[];
    branchId: string;
    sport: string;
    date: string;
    minDate: string;
    maxDate: string;
    onBranch: (id: string) => void;
    onSport: (s: string) => void;
    onDate: (d: string) => void;
}) {
    const branch = branches.find((b) => b.id === branchId);

    return (
        <div className="space-y-4 rounded-2xl border border-evergreen/10 bg-white p-4">
            <div className="grid gap-4 sm:grid-cols-3">
                <Select label="Branch" value={branchId} onChange={(e) => onBranch(e.target.value)}>
                    {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.name}
                        </option>
                    ))}
                </Select>
                <Select label="Sport" value={sport} onChange={(e) => onSport(e.target.value)}>
                    {(branch?.sports ?? []).map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </Select>
                <Input
                    label="Pick a date"
                    type="date"
                    value={date}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => e.target.value && onDate(e.target.value)}
                />
            </div>

            <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays size={16} aria-hidden className="text-teal" /> Next days
                </p>
                <DateStrip dates={datesBetween(minDate, maxDate)} value={date} today={minDate} onChange={onDate} />
            </div>
        </div>
    );
}