"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";

export interface FinderVenue {
    id: string;
    name: string;
    sports: string[];
}

const STORE_KEY = "kt:finder:sport";

export function QuickFinder({
    venue,
    defaultDate,
    minDate,
    maxDate,
}: {
    venue: FinderVenue;
    defaultDate: string;
    minDate: string;
    maxDate: string;
}) {
    const router = useRouter();
    const [sport, setSport] = useState(venue?.sports[0] ?? "");
    const [date, setDate] = useState(defaultDate);

    // Restore remembered sport after hydration.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORE_KEY);
            if (saved && venue?.sports.includes(saved)) setSport(saved);
        } catch {
            /* storage unavailable: keep default */
        }
    }, [venue]);

    function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            localStorage.setItem(STORE_KEY, sport);
        } catch {
            /* ignore */
        }
        // No branch param in the URL — /book defaults to the single venue.
        const q = new URLSearchParams({ sport, date });
        router.push(`/book?${q.toString()}`);
    }

    if (!venue) {
        return <p className="text-sm text-evergreen/80">Bookings open soon. Check back shortly.</p>;
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3 md:items-end" aria-label="Find slots">
            <Select label="Sport" value={sport} onChange={(e) => setSport(e.target.value)}>
                {venue.sports.map((s) => (
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