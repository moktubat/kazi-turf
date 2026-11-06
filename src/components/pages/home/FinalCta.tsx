import Link from "next/link";
import { ArrowRight, CircleDot, Feather, Goal, Target, Trophy } from "lucide-react";
import { venue } from "@/data/branches";

// Same sport → icon mapping used by the "Browse by sport" chips.
function iconFor(name: string): React.ElementType {
    const n = name.toLowerCase();
    if (n.includes("football") || n.includes("futsal")) return Goal;
    if (n.includes("cricket")) return Target;
    if (n.includes("badminton")) return Feather;
    if (n.includes("basket")) return CircleDot;
    return Trophy;
}

const slots: { x: number; y: number; size: number; edge?: boolean; dx: number; dy: number; rot: number; dur: number; delay: number; }[] = [
    { x: 4, y: 14, size: 56, edge: true, dx: 10, dy: -14, rot: 8, dur: 7, delay: 0 },
    { x: 12, y: 5, size: 72, dx: -8, dy: 12, rot: -6, dur: 9, delay: -2 },
    { x: 10, y: 40, size: 64, dx: 12, dy: 10, rot: 10, dur: 8, delay: -4 },
    { x: 3, y: 62, size: 48, edge: true, dx: -6, dy: -12, rot: -8, dur: 6.5, delay: -1 },
    { x: 13, y: 78, size: 60, dx: 10, dy: -10, rot: 6, dur: 8.5, delay: -3 },

    { x: 82, y: 8, size: 64, dx: -10, dy: 12, rot: -8, dur: 8, delay: -1 },
    { x: 91, y: 26, size: 56, edge: true, dx: 8, dy: -12, rot: 8, dur: 7.5, delay: -3 },
    { x: 84, y: 46, size: 72, dx: -12, dy: -8, rot: -10, dur: 9.5, delay: -5 },
    { x: 92, y: 66, size: 52, edge: true, dx: -8, dy: 10, rot: 6, dur: 7, delay: -2 },
    { x: 81, y: 80, size: 56, dx: 10, dy: -12, rot: -6, dur: 8.2, delay: -4 },
];

export function FinalCta() {
    // Use the venue's own sports; repeat them to fill every circle.
    const names = (venue.sportConfigs ?? []).filter((s) => s.active).map((s) => s.name);
    const icons = (names.length ? names : ["Football"]).map(iconFor);

    return (
        <section aria-labelledby="cta-title" className="border-t border-evergreen/10 bg-surface py-14 md:py-20">
            <div className="mx-auto max-w-main px-4">
                <div
                    className="relative overflow-hidden rounded-3xl bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: "url('/sports/cta-bg.webp')" }}
                >
                    {/* Dark overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-evergreen/85 via-evergreen/55 to-evergreen/80" />

                    {/* Floating sport icons */}
                    <div aria-hidden className="pointer-events-none absolute inset-0">
                        {slots.map((s, i) => {
                            const Icon = icons[i % icons.length];
                            return (
                                <span
                                    key={i}
                                    style={
                                        {
                                            left: `${s.x}%`,
                                            top: `${s.y}%`,
                                            width: s.size,
                                            height: s.size,
                                            "--dx": `${s.dx}px`,
                                            "--dy": `${s.dy}px`,
                                            "--rot": `${s.rot}deg`,
                                            "--dur": `${s.dur}s`,
                                            "--delay": `${s.delay}s`,
                                        } as React.CSSProperties
                                    }
                                    className={`float-drift absolute place-items-center rounded-full shadow-card ring-4 ring-surface bg-mint text-teal ${s.edge ? "hidden md:grid" : "hidden lg:grid"
                                        }`}
                                >
                                    <Icon size={Math.round(s.size * 0.45)} />
                                </span>
                            );
                        })}
                    </div>

                    {/* CTA content */}
                    <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center gap-5 px-6 py-24 text-center md:py-32">
                        <h2 id="cta-title" className="text-4xl font-extrabold text-white md:text-5xl">
                            Ready to play?
                        </h2>

                        <p className="text-white/80">
                            See which slots are open, lock yours in with a bKash advance and pay the rest at the venue.
                        </p>

                        <Link
                            href="/book"
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-heading text-base font-semibold text-evergreen transition-colors hover:bg-mint"
                        >
                            Book now <ArrowRight size={18} aria-hidden />
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}