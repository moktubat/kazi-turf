import { Wallet, MapPin, Percent } from "lucide-react";
import { branches } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays, todayDhaka } from "@/lib/time";
import { QuickFinder } from "./QuickFinder";

export async function Hero() {
    const today = await todayDhaka();
    const active = branches
        .filter((b) => b.status === "ACTIVE" && b.sports.length > 0)
        .map(({ id, name, sports }) => ({ id, name, sports }));

    // Trust chips come from real data only.
    const chips = [
        { icon: Wallet, text: "bKash advance payment" },
        { icon: MapPin, text: `${active.length} ${active.length === 1 ? "branch" : "branches"}` },
        { icon: Percent, text: `${policies.advancePercent}% advance, balance at venue` },
    ];

    return (
        <section
            id="finder"
            aria-labelledby="hero-title"
            className="bg-evergreen bg-[radial-gradient(ellipse_at_top_right,rgba(80,200,120,0.25),transparent_60%)] text-white"
        >
            <div className="mx-auto max-w-6xl px-4 py-14 md:py-24">
                <h1 id="hero-title" className="max-w-3xl text-4xl font-extrabold text-white md:text-6xl">
                    Lock Your Slot. <span className="text-emerald">Own The Pitch.</span>
                </h1>
                <p className="mt-4 max-w-xl text-lg text-white/85">
                    Book a turf or court in a few taps. Pay the advance with bKash, settle the rest at the venue.
                </p>

                <ul className="mt-6 flex flex-wrap gap-2">
                    {chips.map(({ icon: Icon, text }) => (
                        <li
                            key={text}
                            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium"
                        >
                            <Icon size={16} aria-hidden className="text-emerald" /> {text}
                        </li>
                    ))}
                </ul>

                <div className="mt-8 rounded-2xl bg-white p-4 text-evergreen shadow-xl md:p-6">
                    <QuickFinder
                        branches={active}
                        defaultDate={today}
                        minDate={today}
                        maxDate={addDays(today, policies.bookingHorizonDays)}
                    />
                </div>
            </div>
        </section>
    );
}