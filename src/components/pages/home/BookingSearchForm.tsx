"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { pitches } from "@/data/pitches";
import { policies } from "@/data/site";
import { addDays } from "@/lib/time";

export function BookingSearchForm({
    sport,
    today,
}: {
    sport: string;
    today: string;
}) {
    const router = useRouter();
    const maxDate = addDays(today, policies.bookingHorizonDays);

    const sportPitches = pitches.filter(
        (p) => p.sport === sport && p.status === "ACTIVE"
    );

    const [pitchId, setPitchId] = useState("");
    const [date, setDate] = useState(today);
    const [slot, setSlot] = useState("");

    // Generate time slots from 06:00 to 24:00 in slotMinutes increments
    const times: string[] = [];
    for (let m = 6 * 60; m < 24 * 60; m += policies.slotMinutes) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        times.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
    }

    function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const params = new URLSearchParams({ sport, date });
        if (pitchId) params.set("pitch", pitchId);
        if (slot) params.set("slot", slot);
        router.push(`/book?${params.toString()}`);
    }

    return (
        <form
            onSubmit={onSubmit}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
            aria-label="Find available slots"
        >
            <Select label="Pitch" value={pitchId} onChange={(e) => setPitchId(e.target.value)}>
                <option value="">Any pitch</option>
                {sportPitches.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name} · {p.format}
                    </option>
                ))}
            </Select>
            <Input
                label="Date"
                type="date"
                value={date}
                min={today}
                max={maxDate}
                onChange={(e) => setDate(e.target.value || today)}
            />
            <Select label="Time slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
                <option value="">Any time</option>
                {times.map((t) => (
                    <option key={t} value={t}>
                        {t}
                    </option>
                ))}
            </Select>
            <Button type="submit" size="lg" className="w-full lg:w-auto">
                <Search size={18} aria-hidden /> Search
            </Button>
        </form>
    );
}