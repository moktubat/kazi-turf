import Link from "next/link";
import { Check } from "lucide-react";
import { venue } from "@/data/branches";
import { getNextOpenSlots, getPitch } from "@/server/availability";
import { addDays } from "@/lib/time";
import { formatBDT, formatTime12 } from "@/lib/format";
import { Section } from "./Section";
import { todayDhaka } from "@/lib/time.server";

export async function OpenToday() {
    const today = await todayDhaka();
    const tomorrow = addDays(today, 1);

    if (venue.status !== "ACTIVE") return null;

    const slots = await getNextOpenSlots(venue.id, today, 4);

    return (
        <Section
            id="today"
            eyebrow="Live availability"
            title="Open today"
            intro="Next available slots. Tap one to start booking."
            tone="mint"
        >
            <div className="rounded-2xl border border-evergreen/10 bg-white p-5 shadow-sm">
                {slots.length === 0 ? (
                    <p className="text-sm text-evergreen/80">
                        Fully booked today.{" "}
                        <Link
                            href={`/book?${new URLSearchParams({ date: tomorrow })}`}
                            className="font-semibold text-teal underline underline-offset-2"
                        >
                            See tomorrow
                        </Link>
                    </p>
                ) : (
                    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
                                        className="flex min-h-20 flex-col justify-center rounded-xl border-2 border-emerald bg-emerald/15 px-3 py-2 transition-colors hover:bg-emerald/30"
                                    >
                                        <span className="flex items-center gap-1.5 font-heading font-bold">
                                            <Check size={16} aria-hidden className="text-teal" /> {formatTime12(s.start)}
                                        </span>
                                        <span className="text-sm font-semibold text-teal">{formatBDT(s.price)}</span>
                                        <span className="truncate text-xs text-evergreen/70">{s.pitchName}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </Section>
    );
}