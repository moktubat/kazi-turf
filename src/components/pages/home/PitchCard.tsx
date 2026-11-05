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

const MAX_CHIPS = 3;

export async function PitchCard({ pitch }: { pitch: Pitch }) {
    const rows = await getRateTable(pitch.id);
    const sizeKnown = pitch.dimensions && !/verified/i.test(pitch.dimensions);

    // Starting price = lowest real price in this pitch's rate table. Hidden if none exist.
    const prices = rows
        .flatMap((r) => [r.offPeak?.price, r.peak?.price])
        .filter((p): p is number => typeof p === "number" && p > 0);
    const from = prices.length ? Math.min(...prices) : null;

    const shown = pitch.facilities.slice(0, MAX_CHIPS);
    const extra = pitch.facilities.length - shown.length;
    const meta = [pitch.sport, pitch.format, pitch.surface, sizeKnown ? pitch.dimensions : null]
        .filter(Boolean)
        .join(" · ");
    const active = pitch.status === "ACTIVE";

    return (
        <article className="group flex flex-col overflow-hidden rounded-2xl border border-evergreen/10 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg">
            <div className="relative aspect-video overflow-hidden bg-mint">
                {pitch.image ? (
                    <Image
                        src={pitch.image}
                        alt={`${pitch.name} — ${pitch.sport}`}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-evergreen/60">
                        <ImageOff size={28} aria-hidden />
                        <span className="text-sm">Photo coming soon</span>
                    </div>
                )}
                <span
                    className={`absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${active ? "bg-white text-evergreen" : "bg-maint-soft text-maint"
                        }`}
                >
                    {active ? "Active" : "Disabled"}
                </span>
            </div>

            <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h4 className="text-lg font-bold">{pitch.name}</h4>
                        <p className="text-sm text-evergreen/80">{meta}</p>
                    </div>
                    {from !== null && (
                        <div className="shrink-0 text-right">
                            <p className="text-xs text-evergreen/70">From</p>
                            <p className="font-heading text-lg font-extrabold text-teal">{formatBDT(from)}</p>
                            <p className="text-xs text-evergreen/70">per slot</p>
                        </div>
                    )}
                </div>

                <ul className="flex flex-wrap gap-2" aria-label="Facilities">
                    {shown.map((f) => {
                        const Icon = facilityIcon[f] ?? Check;
                        return (
                            <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-semibold">
                                <Icon size={14} aria-hidden className="text-teal" /> {f}
                            </li>
                        );
                    })}
                    {extra > 0 && (
                        <li className="inline-flex items-center rounded-full bg-evergreen/5 px-3 py-1 text-xs font-semibold">
                            +{extra} more
                        </li>
                    )}
                </ul>

                <div className="mt-auto grid grid-cols-2 gap-2">
                    <PitchDetails name={pitch.name} meta={meta} facilities={pitch.facilities} rows={rows} />
                    <Button
                        href={`/book?${new URLSearchParams({ sport: pitch.sport, pitch: pitch.id })}`}
                    >
                        Book now
                    </Button>
                </div>
            </div>
        </article>
    );
}