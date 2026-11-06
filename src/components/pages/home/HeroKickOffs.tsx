import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { venue } from "@/data/branches";
import { getNextOpenSlots, getPitch } from "@/server/availability";
import { addDays } from "@/lib/time";
import { formatBDT, formatTime12 } from "@/lib/format";

// Only change: semi-transparent dark green (was bg-pitch/80) + stronger blur.
const shell =
    "rounded-2xl border border-white/10 bg-pitch/45 p-4 text-white shadow-2xl backdrop-blur-lg md:p-5";

export function KickOffsFallback() {
    return (
        <div className={shell} aria-busy>
            <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
            <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg bg-white/10" />
                ))}
            </div>
        </div>
    );
}

export async function HeroKickOffs({ today }: { today: string }) {
    if (venue.status !== "ACTIVE") return null;

    const slots = await getNextOpenSlots(venue.id, today, 5);
    const tomorrow = addDays(today, 1);

    return (
        <aside aria-label="Next open slots" className={shell}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.18em]">
                    <span aria-hidden className="size-2 animate-pulse rounded-full bg-emerald" />
                    Next kick-offs
                </p>
                <p className="text-xs text-white/60">Live availability</p>
            </div>

            {slots.length === 0 ? (
                <p className="py-6 text-sm text-white/80">
                    Fully booked today.{" "}
                    <Link
                        href={`/book?${new URLSearchParams({ date: tomorrow })}`}
                        className="font-semibold text-emerald underline underline-offset-2"
                    >
                        See tomorrow
                    </Link>
                </p>
            ) : (
                <ul className="divide-y divide-white/10">
                    {slots.map((s) => {
                        const sport = getPitch(s.pitchId)?.sport ?? "";
                        const href = `/book?${new URLSearchParams({
                            sport,
                            date: today,
                            pitch: s.pitchId,
                            slot: s.start,
                        })}`;
                        return (
                            <li key={`${s.pitchId}-${s.cellStart}`}>
                                <Link
                                    href={href}
                                    aria-label={`Book ${formatTime12(s.start)} on ${s.pitchName}, ${formatBDT(s.price)}`}
                                    className="grid min-h-14 grid-cols-[5rem_1fr_auto] items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-white/5"
                                >
                                    <span className="font-heading text-lg font-extrabold tabular-nums">
                                        {formatTime12(s.start)}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold">{s.pitchName}</span>
                                        {sport && <span className="block truncate text-xs text-white/60">{sport}</span>}
                                    </span>
                                    <span className="font-heading text-sm font-bold text-emerald">{formatBDT(s.price)}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Link
                href={`/book?${new URLSearchParams({ date: today })}`}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
                See every free slot <ArrowRight size={16} aria-hidden />
            </Link>
        </aside>
    );
}