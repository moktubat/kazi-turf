"use client";
import { useState } from "react";
import { venue } from "@/data/branches";
import { SportTabs } from "./SportTabs";
import { BookingSearchForm } from "./BookingSearchForm";

export function Hero({ today }: { today: string }) {
    const sports = venue.sportConfigs.filter((s) => s.active);
    const [sportId, setSportId] = useState(sports[0]?.id ?? "");

    const current = sports.find((s) => s.id === sportId) ?? sports[0];
    const bgImage = current?.image;

    return (
        <section className="relative min-h-[100svh] overflow-hidden">
            {/* Background image — changes with selected sport */}
            {bgImage ? (
                <div
                    key={sportId}
                    className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 animate-[fadeIn_0.7s_ease-out]"
                    style={{ backgroundImage: `url(${bgImage})` }}
                />
            ) : (
                <div className="absolute inset-0 bg-evergreen bg-[radial-gradient(ellipse_at_top_right,rgba(80,200,120,0.25),transparent_60%)]" />
            )}

            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-evergreen/50" />

            {/* Content */}
            <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-4 pt-20 pb-12">
                {/* Heading */}
                <div className="mb-6 text-center text-white">
                    <h1 className="text-3xl font-extrabold md:text-5xl lg:text-6xl">
                        Lock Your Slot.{" "}
                        <span className="text-emerald">Own The Pitch.</span>
                    </h1>
                    <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 md:text-lg">
                        Book a turf or court in a few taps. Pay the advance with bKash, settle
                        the rest at the venue.
                    </p>
                </div>

                {/* Sport tabs (auto-shuffle) */}
                <div className="mb-5">
                    <SportTabs
                        sports={sports}
                        value={sportId}
                        onChange={setSportId}
                    />
                </div>

                {/* Booking form card */}
                <div className="mx-auto w-full max-w-4xl rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur md:p-6">
                    <BookingSearchForm
                        sport={current?.name ?? "Football"}
                        today={today}
                    />
                </div>

                {/* Trust chips */}
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {[
                        "bKash advance payment",
                        "40% advance, balance at venue",
                        "Instant confirmation",
                    ].map((text) => (
                        <span
                            key={text}
                            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
                        >
                            {text}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}