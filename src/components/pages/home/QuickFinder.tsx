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

const STORE_KEY = "kt:finder"; // remembers last branch + sport only

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
    const first = branches[0];
    const [branchId, setBranchId] = useState(first?.id ?? "");
    const [sport, setSport] = useState(first?.sports[0] ?? "");
    const [date, setDate] = useState(defaultDate);

    // Restore remembered context after hydration.
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
            const b = branches.find((x) => x.id === saved?.branch);
            if (b) {
                setBranchId(b.id);
                setSport(b.sports.includes(saved.sport) ? saved.sport : b.sports[0]);
            }
        } catch {
            /* storage unavailable: keep defaults */
        }
    }, [branches]);

    const current = branches.find((b) => b.id === branchId);

    function onBranchChange(id: string) {
        setBranchId(id);
        const b = branches.find((x) => x.id === id);
        if (b && !b.sports.includes(sport)) setSport(b.sports[0] ?? "");
    }

    function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({ branch: branchId, sport }));
        } catch {
            /* ignore */
        }
        const q = new URLSearchParams({ branch: branchId, sport, date });
        router.push(`/book?${q.toString()}`);
    }

    if (!first) {
        return <p className="text-sm text-evergreen/80">Bookings open soon. Check back shortly.</p>;
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-4 md:items-end" aria-label="Find slots">
            <Select label="Branch" value={branchId} onChange={(e) => onBranchChange(e.target.value)}>
                {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                        {b.name}
                    </option>
                ))}
            </Select>
            <Select label="Sport" value={sport} onChange={(e) => setSport(e.target.value)}>
                {(current?.sports ?? []).map((s) => (
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