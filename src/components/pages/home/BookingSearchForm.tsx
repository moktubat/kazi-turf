"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { addDays } from "@/lib/time";
import { formatTime12 } from "@/lib/format";
import type { Branch, Pitch, Policies } from "@/types";

const label = "block text-xs font-bold uppercase tracking-wider text-evergreen/60";
const control = "mt-1 block w-full min-w-0 cursor-pointer bg-transparent text-base font-semibold text-evergreen outline-none";
const cell = "rounded-2xl px-4 py-3 transition-colors focus-within:bg-mint/70 hover:bg-mint/50";

export function BookingSearchForm({
    sport,
    today,
    policies,
    pitches: pitchesProp,
    venue: _venue,
}: {
    sport: string;
    today: string;
    venue: Branch;
    policies: Policies;
    pitches?: Pitch[];
}) {
    const router = useRouter();
    const maxDate = addDays(today, policies.bookingHorizonDays);
    const uid = useId();

    const sportPitches = (pitchesProp ?? []).filter(
        (p) => p.sport === sport && p.status === "ACTIVE"
    );

    const [pitchId, setPitchId] = useState("");
    const [date, setDate] = useState(today);
    const [slot, setSlot] = useState("");

    // 24-hour turf: build slot times for the full day using the global slot length.
    // (Per-pitch length is respected on the /book page after the user picks a pitch.)
    const slotMinutes = policies.slotMinutes;
    const openMin = 0;     // 00:00 — open 24 hours
    const closeMin = 24 * 60; // 24:00

    const times: string[] = [];
    for (let m = openMin; m < closeMin; m += slotMinutes) {
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
            // Bigger search box: stack on small screens, 3 inputs + button on lg.
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center lg:gap-2"
            aria-label="Find available slots"
        >
            <div className={`${cell} lg:rounded-r-none`}>
                <label htmlFor={`${uid}-pitch`} className={label}>Pitch</label>
                <select id={`${uid}-pitch`} value={pitchId} onChange={(e) => setPitchId(e.target.value)} className={control}>
                    <option value="">Any pitch</option>
                    {sportPitches.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name} · {p.format}
                        </option>
                    ))}
                </select>
            </div>

            <div className={`${cell} lg:rounded-none lg:border-l lg:border-evergreen/10`}>
                <label htmlFor={`${uid}-date`} className={label}>Date</label>
                <input
                    id={`${uid}-date`}
                    type="date"
                    value={date}
                    min={today}
                    max={maxDate}
                    onChange={(e) => setDate(e.target.value || today)}
                    className={control}
                />
            </div>

            <div className={`${cell} lg:rounded-none lg:border-l lg:border-evergreen/10`}>
                <label htmlFor={`${uid}-slot`} className={label}>Time slot</label>
                <select id={`${uid}-slot`} value={slot} onChange={(e) => setSlot(e.target.value)} className={control}>
                    <option value="">Any time</option>
                    {times.map((t) => (
                        <option key={t} value={t}>
                            {formatTime12(t)}
                        </option>
                    ))}
                </select>
            </div>

            <button
                type="submit"
                // Bigger, taller, full-width on mobile, side-by-side on lg.
                className="mt-1 inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-teal px-8 font-heading text-base font-bold text-white transition-colors hover:bg-evergreen sm:col-span-2 lg:col-span-1 lg:mt-0 lg:ml-2"
            >
                <Search size={20} aria-hidden /> Search
            </button>
        </form>
    );
}