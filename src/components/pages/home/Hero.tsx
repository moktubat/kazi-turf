"use client";
import { useEffect, useState } from "react";
import { venue } from "@/data/branches";
import { BookingSearchForm } from "./BookingSearchForm";

export function Hero({ today, aside }: { today: string; aside?: React.ReactNode }) {
    const sports = venue.sportConfigs.filter((s) => s.active);
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
        return () => {
            cancelled = true;
        };
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
        // Full screen on laptops/desktops. On phones the content stacks and the section grows if it must.
        <section className="relative -mt-17 min-h-svh overflow-hidden lg:h-svh">
            <div className="absolute inset-0 bg-evergreen">
                {background && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${background})` }} />}
                {nextBackground && (
                    <div className="absolute inset-0 bg-cover bg-center animate-[fadeIn_0.8s_ease-in-out]"
                        style={{ backgroundImage: `url(${nextBackground})` }}
                        onAnimationEnd={() => { setBackground(nextBackground); setNextBackground(""); }}
                    />
                )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-evergreen/85 via-evergreen/55 to-evergreen/80" />

            <div className="relative z-10 mx-auto grid h-full max-w-main items-center gap-6 px-4 pb-8 pt-24 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:gap-x-12 lg:pb-6 lg:pt-20">
                {/* LEFT: headline + sport pills + search bar (max 600px on large screens) */}
                <div className="min-w-0 space-y-8 lg:max-w-[600px] lg:space-y-7">
                    <div className="text-surface">
                        <p className="mb-5 flex items-center gap-3 font-heading text-xs font-bold uppercase tracking-[0.18em] text-emerald">
                            <span aria-hidden className="h-0.5 w-8 bg-emerald" />
                            {sports.length} {sports.length === 1 ? "sport" : "sports"} · Live slots
                        </p>
                        <h1 className="space-y-1 text-4xl font-extrabold uppercase leading-[1.12] tracking-tight text-[#F5F7F3] lg:text-[clamp(2rem,6vh,3.25rem)]">
                            <span className="block">Lock Your Slot.</span>
                            <span className="block text-emerald">Own The Pitch.</span>
                        </h1>
                        <p className="mt-5 max-w-md text-sm leading-7 text-surface/85">
                            Book a turf or court in a few taps. Pay the advance with bKash, settle the rest at the venue.
                        </p>
                    </div>

                    <div className="space-y-5">
                        {/* Sport pills */}
                        <div role="tablist" aria-label="Select sport" className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
                            {sports.map((s) => {
                                const selected = s.id === sportId;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={selected}
                                        onClick={() => {
                                            setAutoRotate(false);
                                            setSportId(s.id);
                                        }}
                                        className={`min-h-10 shrink-0 rounded-full border px-5 text-sm font-semibold backdrop-blur-sm transition-colors ${selected
                                            ? "border-emerald bg-emerald text-evergreen"
                                            : "border-surface/25 bg-surface/10 text-surface hover:bg-surface/20"
                                            }`}
                                    >
                                        {s.name}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Compact search bar: narrower than the column on large screens */}
                        <div className="rounded-2xl bg-[#F5F7F3] p-1.5 text-evergreen shadow-2xl lg:max-w-[570px]">
                            <BookingSearchForm sport={current?.name ?? "Football"} today={today} />
                        </div>
                    </div>
                </div>

                {/* RIGHT: live next kick-offs (after the form on phones) */}
                {aside && (
                    <div className="scrollbar-thin order-last w-full min-w-0 lg:order-none lg:max-h-full lg:max-w-sm lg:justify-self-end lg:overflow-y-auto">
                        {aside}
                    </div>
                )}
            </div>
        </section>
    );
}