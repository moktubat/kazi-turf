import Image from "next/image";
import { Lightbulb, Car, Droplets, Check, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBDT } from "@/lib/format";
import { getRateTable } from "@/server/pricing/rateTable";
import type { Pitch } from "@/types";
import { PitchDetails } from "./PitchDetails";

const facilityIcon: Record<string, React.ElementType> = {
    Floodlights: Lightbulb,
    Parking: Car,
    Washroom: Droplets,
};

export async function PitchCard({ pitch }: { pitch: Pitch }) {
    const rows = await getRateTable(pitch.id);
    const sizeKnown = pitch.dimensions && !/verified/i.test(pitch.dimensions);

    // Starting price = lowest real price in this pitch's rate table. Hidden if none exist.
    const prices = rows
        .flatMap((r) => [r.offPeak?.price, r.peak?.price])
        .filter((p): p is number => typeof p === "number" && p > 0);
    const from = prices.length ? Math.min(...prices) : null;

    const meta = [pitch.sport, pitch.format, pitch.surface, sizeKnown ? pitch.dimensions : null]
        .filter(Boolean)
        .join(" · ");

    const specs = [
        ["Format", pitch.format],
        ["Surface", pitch.surface],
        ["Size", sizeKnown ? pitch.dimensions : null],
    ].filter((s): s is [string, string] => !!s[1]);

    const active = pitch.status === "ACTIVE";

    return (
        <article className="group flex flex-col overflow-hidden rounded-3xl border border-evergreen/10 bg-surface shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lift">
            {/* Photo */}
            <div className="relative aspect-[16/10] overflow-hidden bg-mint">
                {pitch.image ? (
                    <Image
                        src={pitch.image}
                        alt={`${pitch.name} — ${pitch.sport}`}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-evergreen/60">
                        <ImageOff size={28} aria-hidden />
                        <span className="text-sm">Photo coming soon</span>
                    </div>
                )}
                <div aria-hidden className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-evergreen/50 to-transparent" />
                <span
                    className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${active ? "bg-emerald text-evergreen" : "bg-maint-soft text-maint"
                        }`}
                >
                    {active && <span aria-hidden className="size-1.5 rounded-full bg-evergreen" />}
                    {active ? "Available" : "Disabled"}
                </span>
                <span className="absolute right-3 top-3 rounded-full border border-white/25 bg-evergreen/40 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
                    {pitch.sport}
                </span>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col gap-4 p-5">
                <h4 className="text-xl font-extrabold">{pitch.name}</h4>

                {specs.length > 0 && (
                    <dl
                        className="grid gap-3 border-y border-evergreen/10 py-3"
                        style={{ gridTemplateColumns: `repeat(${specs.length}, minmax(0, 1fr))` }}
                    >
                        {specs.map(([k, v]) => (
                            <div key={k} className="min-w-0">
                                <dt className="text-[11px] font-semibold uppercase tracking-wider text-evergreen/55">{k}</dt>
                                <dd className="mt-0.5 truncate text-sm font-semibold">{v}</dd>
                            </div>
                        ))}
                    </dl>
                )}

                {pitch.facilities.length > 0 && (
                    <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-evergreen/55">Facilities</p>
                        <ul className="flex flex-wrap gap-1.5" aria-label="Facilities">
                            {pitch.facilities.map((f) => {
                                const Icon = facilityIcon[f] ?? Check;
                                return (
                                    <li
                                        key={f}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-evergreen/10 bg-mint/60 px-2.5 py-1 text-xs font-medium"
                                    >
                                        <Icon size={13} aria-hidden className="text-teal" /> {f}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {/* Footer: price + actions */}
                <div className="mt-auto space-y-3 pt-1">
                    {from !== null && (
                        <p className="flex items-baseline gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wider text-evergreen/55">From</span>
                            <span className="font-heading text-2xl font-extrabold text-teal">{formatBDT(from)}</span>
                            <span className="text-xs text-evergreen/60">per slot</span>
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <PitchDetails name={pitch.name} meta={meta} facilities={pitch.facilities} rows={rows} />
                        <Button href={`/book?${new URLSearchParams({ sport: pitch.sport, pitch: pitch.id })}`}>
                            Book now
                        </Button>
                    </div>
                </div>
            </div>
        </article>
    );
}