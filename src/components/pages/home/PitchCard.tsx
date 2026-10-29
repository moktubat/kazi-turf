import Image from "next/image";
import { Lightbulb, Car, Droplets, Check, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBDT } from "@/lib/format";
import { getRateTable } from "@/server/pricing/rateTable";
import type { Pitch } from "@/types";

const facilityIcon: Record<string, React.ElementType> = {
    Floodlights: Lightbulb,
    Parking: Car,
    Washroom: Droplets,
};

export function PitchCard({ pitch }: { pitch: Pitch }) {
    const rows = getRateTable(pitch.id);
    // Hide placeholder text until a real, verified size is entered.
    const sizeKnown = pitch.dimensions && !/verified/i.test(pitch.dimensions);

    return (
        <article className="flex flex-col overflow-hidden rounded-2xl border border-evergreen/10 bg-white shadow-sm">
            <div className="relative aspect-video bg-mint">
                {pitch.image ? (
                    <Image
                        src={pitch.image}
                        alt={`${pitch.name} at the ${pitch.sport} venue`}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-evergreen/60">
                        <ImageOff size={28} aria-hidden />
                        <span className="text-sm">Photo coming soon</span>
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col gap-4 p-5">
                <div>
                    <h4 className="text-lg font-bold">{pitch.name}</h4>
                    <p className="text-sm text-evergreen/80">
                        {pitch.sport} · {pitch.format} · {pitch.surface}
                        {sizeKnown && <> · {pitch.dimensions}</>}
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <caption className="sr-only">Rates per 90-minute slot for {pitch.name}</caption>
                        <thead>
                            <tr className="border-b border-evergreen/10 text-xs uppercase tracking-wide text-evergreen/70">
                                <th scope="col" className="py-2 pr-3 font-semibold">Days</th>
                                <th scope="col" className="py-2 pr-3 font-semibold">Off-peak</th>
                                <th scope="col" className="py-2 font-semibold">Peak</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.days} className="border-b border-evergreen/5 last:border-0">
                                    <th scope="row" className="py-2 pr-3 font-semibold">{r.days}</th>
                                    <td className="py-2 pr-3">
                                        {r.offPeak ? (
                                            <>
                                                <span className="font-semibold">{formatBDT(r.offPeak.price)}</span>
                                                <span className="block text-xs text-evergreen/70">{r.offPeak.window}</span>
                                            </>
                                        ) : "–"}
                                    </td>
                                    <td className="py-2">
                                        {r.peak ? (
                                            <>
                                                <span className="font-semibold">{formatBDT(r.peak.price)}</span>
                                                <span className="block text-xs text-evergreen/70">{r.peak.window}</span>
                                            </>
                                        ) : "–"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="mt-1 text-xs text-evergreen/70">Price per 90-minute slot.</p>
                </div>

                <ul className="flex flex-wrap gap-2" aria-label="Facilities">
                    {pitch.facilities.map((f) => {
                        const Icon = facilityIcon[f] ?? Check;
                        return (
                            <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-semibold">
                                <Icon size={14} aria-hidden className="text-teal" /> {f}
                            </li>
                        );
                    })}
                </ul>

                <Button href={`/book?pitch=${pitch.id}`} className="mt-auto w-full">
                    Book this pitch
                </Button>
            </div>
        </article>
    );
}