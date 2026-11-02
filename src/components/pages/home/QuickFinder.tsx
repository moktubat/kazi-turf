"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";

export interface FinderBranch {
    id: string;
    name: string;
    sports: string[];
}

const STORE_KEY = "kt:finder:sport"; // remembers last sport only

export function QuickFinder({
    branches,
    defaultDate,
    minDate,
    maxDate,
}: {
    branches: FinderBranch[];
    defaultDate: string;
    minDate: string;
    maxDate: string;
}) {
    const router = useRouter();
    const branch = branches[0];
    const [sport, setSport] = useState(branch?.sports[0] ?? "");
    const [date, setDate] = useState(defaultDate);

    // Restore remembered sport after hydration.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORE_KEY);
            if (saved && branch?.sports.includes(saved)) setSport(saved);
        } catch {
            /* storage unavailable: keep default */
        }
    }, [branch]);

    function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            localStorage.setItem(STORE_KEY, sport);
        } catch {
            /* ignore */
        }
        const q = new URLSearchParams({ branch: branch.id, sport, date });
        router.push(`/book?${q.toString()}`);
    }

    if (!branch) {
        return <p className="text-sm text-evergreen/80">Bookings open soon. Check back shortly.</p>;
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3 md:items-end" aria-label="Find slots">
            <Select label="Sport" value={sport} onChange={(e) => setSport(e.target.value)}>
                {branch.sports.map((s) => (
                    <option key={s} value={s}>
                        {s}
                    </option>
                ))}
            </Select>
            <Input
                label="Date"
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => setDate(e.target.value || defaultDate)}
            />
            <Button type="submit" size="lg" className="w-full">
                <Search size={18} aria-hidden /> Find Slots
            </Button>
        </form>
    );
}