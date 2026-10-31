import Link from "next/link";
import { Check } from "lucide-react";
import { branches } from "@/data/branches";
import { getNextOpenSlots, getPitch } from "@/server/availability";
import { addDays, todayDhaka } from "@/lib/time";
import { formatBDT } from "@/lib/format";
import { Section } from "./Section";

export async function OpenToday() {
    const today = await todayDhaka();
    const tomorrow = addDays(today, 1);

    const rows = await Promise.all(
        branches
            .filter((b) => b.status === "ACTIVE")
            .map(async (branch) => ({ branch, slots: await getNextOpenSlots(branch.id, today, 4) }))
    );

    // Hidden when no live data exists.
    if (rows.length === 0) return null;

    return (
        <Section id="today" title="Open today" intro="Next available slots. Tap one to start booking." tone="mint">
            <div className="grid gap-6 md:grid-cols-2">
                {rows.map(({ branch, slots }) => (
                    <div key={branch.id} className="rounded-2xl border border-evergreen/10 bg-white p-5">
                        <h3 className="text-lg font-bold">{branch.name}</h3>

                        {slots.length === 0 ? (
                            <p className="mt-3 text-sm text-evergreen/80">
                                Fully booked today.{" "}
                                <Link
                                    href={`/book?${new URLSearchParams({ branch: branch.id, date: tomorrow })}`}
                                    className="font-semibold text-teal underline underline-offset-2"
                                >
                                    See tomorrow
                                </Link>
                            </p>
                        ) : (
                            <ul className="mt-4 grid grid-cols-2 gap-3">
                                {slots.map((s) => {
                                    const sport = getPitch(s.pitchId)?.sport ?? "";
                                    const href = `/book?${new URLSearchParams({
                                        branch: branch.id,
                                        sport,
                                        date: today,
                                        pitch: s.pitchId,
                                        slot: s.start,
                                    })}`;
                                    return (
                                        <li key={`${s.pitchId}-${s.cellStart}`}>
                                            <Link
                                                href={href}
                                                aria-label={`Book ${s.start} on ${s.pitchName}, ${formatBDT(s.price)}`}
                                                className="flex min-h-16 flex-col justify-center rounded-xl border-2 border-emerald bg-emerald/15 px-3 py-2 hover:bg-emerald/30"
                                            >
                                                <span className="flex items-center gap-1.5 font-heading font-bold">
                                                    <Check size={16} aria-hidden className="text-teal" /> {s.start}
                                                </span>
                                                <span className="text-sm font-semibold text-teal">{formatBDT(s.price)}</span>
                                                <span className="text-xs text-evergreen/70">{s.pitchName}</span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </Section>
    );
}