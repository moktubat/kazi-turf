"use client";
import { useEffect, useState } from "react";
import { BookingSearchForm } from "./BookingSearchForm";
import type { Branch, Policies } from "@/types";

export function Hero({
    today,
    venue,
    policies,
}: {
    today: string;
    venue: Branch;
    policies: Policies;
}) {
    const sports = (venue.sportConfigs ?? []).filter((s) => s.active);
    const [sportId, setSportId] = useState(sports[0]?.id ?? "");
    const current = sports.find((s) => s.id === sportId) ?? sports[0];
    const [background, setBackground] = useState(current?.image ?? "");
    const [nextBackground, setNextBackground] = useState("");
    const [autoRotate, setAutoRotate] = useState(true);

    useEffect(() => {
        if (!current?.image || current.image === background) return;
        const img = new Image();
        let cancelled = false;
        img.onload = () => {
            if (!cancelled) setNextBackground(current.image);
        };
        img.src = current.image;
        return () => { cancelled = true; };
    }, [current?.image, background]);

    useEffect(() => {
        if (!autoRotate || sports.length <= 1) return;
        const interval = setInterval(() => {
            setSportId((prev) => {
                const currentIndex = sports.findIndex((s) => s.id === prev);
                const nextIndex = (currentIndex + 1) % sports.length;
                return sports[nextIndex].id;
            });
        }, 5000);
        return () => clearInterval(interval);
    }, [autoRotate, sports]);

    return (
        <section className="relative -mt-17 min-h-svh overflow-hidden lg:h-svh">
            {/* Background image + overlay */}
            <div className="absolute inset-0 bg-evergreen">
                {background && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${background})` }} />}
                {nextBackground && (
                    <div className="absolute inset-0 bg-cover bg-center animate-[fadeIn_0.8s_ease-in-out]"
                        style={{ backgroundImage: `url(${nextBackground})` }}
                        onAnimationEnd={() => { setBackground(nextBackground); setNextBackground(""); }}
                    />
                )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-evergreen/80 via-evergreen/55 to-evergreen/80" />

            {/* Centered content: just the sport tabs + a bigger search box */}
            <div className="relative z-10 mx-auto flex min-h-svh max-w-3xl flex-col items-center justify-center gap-6 px-4 py-24 lg:max-w-4xl">
                {/* Sport tabs */}
                <div role="tablist" aria-label="Select sport" className="scrollbar-thin flex w-full justify-center gap-2 overflow-x-auto pb-1">
                    {sports.map((s) => {
                        const selected = s.id === sportId;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => { setAutoRotate(false); setSportId(s.id); }}
                                className={`min-h-12 shrink-0 rounded-full border px-7 text-base font-semibold backdrop-blur-sm transition-colors ${selected ? "border-emerald bg-emerald text-evergreen" : "border-surface/25 bg-surface/10 text-surface hover:bg-surface/20"}`}
                            >
                                {s.name}
                            </button>
                        );
                    })}
                </div>

                {/* Bigger search box — full width */}
                <div className="w-full rounded-3xl bg-[#F5F7F3] p-3 text-evergreen shadow-2xl sm:p-4">
                    <BookingSearchForm
                        sport={current?.name ?? "Football"}
                        today={today}
                        venue={venue}
                        policies={policies}
                        onInteract={() => setAutoRotate(false)}
                    />
                </div>
            </div>
        </section>
    );
}