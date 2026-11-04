"use client";
import { useEffect, useState } from "react";
import { venue } from "@/data/branches";
import { BookingSearchForm } from "./BookingSearchForm";

export function Hero({ today }: { today: string }) {
    const sports = venue.sportConfigs.filter((s) => s.active);
    const [sportId, setSportId] = useState(sports[0]?.id ?? "");
    const current = sports.find((s) => s.id === sportId) ?? sports[0];
    const [background, setBackground] = useState(current?.image ?? "");
    const [nextBackground, setNextBackground] = useState("");

    useEffect(() => {
        if (!current?.image || current.image === background) return;
        const img = new Image();
        let cancelled = false;
        img.onload = () => !cancelled && setNextBackground(current.image);
        img.src = current.image;
        return () => { cancelled = true; };
    }, [sportId, current?.image, background]);

    return (
        <section className="relative -mt-16 h-[min(700px,100svh)] overflow-hidden">
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

            <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-4 pt-16 pb-8">
                <div className="mb-8 text-center text-white">
                    <h1 className="text-[#F5F7F3] text-3xl font-extrabold md:text-5xl">
                        Lock Your Slot. <span className="text-[#F5F7F3]">Own The Pitch.</span>
                    </h1>
                    <p className="mx-auto mt-3 max-w-xl text-sm text-white md:text-base">
                        Book a turf or court in a few taps. Pay the advance with bKash, settle the rest at the venue.
                    </p>
                </div>

                <div className="mx-auto w-full max-w-4xl overflow-hidden shadow-2xl">
                    <div className="w-fit mx-auto overflow-hidden rounded-t-lg bg-[#F5F7F3]">
                        <div role="tablist" aria-label="Select sport" className="flex w-fit gap-1 px-3 pt-3">
                            {sports.map((s) => {
                                const selected = s.id === sportId;
                                return (
                                    <button key={s.id} type="button" role="tab" aria-selected={selected}
                                        onClick={() => setSportId(s.id)}
                                        className={`w-28 shrink-0 rounded-t-xl px-3 py-2.5 text-center text-sm font-medium ${selected ? "bg-[#F5F7F3] text-evergreen" : "text-evergreen/70 hover:text-evergreen"}`}>
                                        <span className={selected ? "border-b-2 border-evergreen px-1 pb-1" : ""}>{s.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="rounded-[20px] bg-[#F5F7F3] p-4 text-evergreen md:p-6">
                        <BookingSearchForm sport={current?.name ?? "Football"} today={today} />
                    </div>
                </div>
            </div>
        </section>
    );
}
