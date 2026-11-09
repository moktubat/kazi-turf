import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getNextOpenSlots, getPitch } from "@/server/availability";
import { addDays } from "@/lib/time";
import { formatBDT, formatTime12 } from "@/lib/format";
import type { Branch } from "@/types";

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

export async function HeroKickOffs({
    today,
    venue,
}: {
    today: string;
    venue: Branch;
}) {
    if (venue.status !== "ACTIVE") return null;

    // getNextOpenSlots is async (reads from MongoDB). getPitch is sync (reads
    // the in-memory array populated by ensureConfig at request start).
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
                <div className="py-6 text-center">
                    <p className="text-sm font-semibold text-white">No slots available today</p>
                    <p className="mt-1 text-xs text-white/70">
                        Booking opens soon — please check back later.
                    </p>
                    <Link
                        href={`/book?${new URLSearchParams({ date: tomorrow })}`}
                        className="mt-3 inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                    >
                        Check tomorrow <ArrowRight size={12} aria-hidden />
                    </Link>
                </div>
            ) : (
                <ul className="divide-y divide-white/10">
                    {slots.map((s) => {
                        // Sync — reads from the in-memory pitches array
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