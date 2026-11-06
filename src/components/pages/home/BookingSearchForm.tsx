"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { pitches } from "@/data/pitches";
import { policies } from "@/data/site";
import { addDays } from "@/lib/time";
import { formatTime12 } from "@/lib/format";

const label = "block text-[11px] font-bold uppercase tracking-wider text-evergreen/60";
const control =
    "mt-0.5 block w-full min-w-0 cursor-pointer bg-transparent text-sm font-semibold text-evergreen outline-none";
const cell =
    "rounded-xl px-3 py-2 transition-colors focus-within:bg-mint/70 hover:bg-mint/50";

export function BookingSearchForm({
    sport,
    today,
}: {
    sport: string;
    today: string;
}) {
    const router = useRouter();
    const maxDate = addDays(today, policies.bookingHorizonDays);
    const uid = useId();

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
            className="grid gap-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center lg:gap-0"
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
                className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-6 font-heading text-sm font-bold text-white transition-colors hover:bg-evergreen sm:col-span-2 lg:col-span-1 lg:mt-0 lg:ml-2"
            >
                <Search size={18} aria-hidden /> Search
            </button>
        </form>
    );
}