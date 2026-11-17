"use client";
import { useState, useSyncExternalStore } from "react";
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

function readSavedSport(): string | null {
    try {
        return localStorage.getItem(STORE_KEY);
    } catch {
        return null; // storage unavailable: keep the default
    }
}

/** Re-read when another tab changes the saved sport. */
function subscribeStorage(onChange: () => void) {
    const onStorage = (e: StorageEvent) => {
        if (e.key === STORE_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}

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
    // The remembered sport is read from browser storage as an external store: null on the server
    // and during hydration (no mismatch), then the saved value. A sport the user picks wins.
    const saved = useSyncExternalStore(subscribeStorage, readSavedSport, () => null);
    const [picked, setPicked] = useState<string | null>(null);
    const sport = picked ?? (saved && venue?.sports.includes(saved) ? saved : (venue?.sports[0] ?? ""));
    const setSport = setPicked;
    const [date, setDate] = useState(defaultDate);

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