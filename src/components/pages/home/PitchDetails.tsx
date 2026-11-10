"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SideSheet } from "@/components/ui/SideSheet";
import { formatBDT } from "@/lib/format";

export interface RateRowView {
    days: string;
    offPeak?: { price: number; originalPrice: number; hasDiscount: boolean; window: string } | null;
    peak?: { price: number; originalPrice: number; hasDiscount: boolean; window: string } | null;
}

export function PitchDetails({
    name,
    meta,
    facilities,
    rows,
}: {
    name: string;
    meta: string;
    facilities: string[];
    rows: RateRowView[];
}) {
    const [open, setOpen] = useState(false);
    const cell = (r?: { price: number; originalPrice: number; hasDiscount: boolean; window: string } | null) =>
        r ? (
            <>
                {r.hasDiscount ? (
                    <span className="font-semibold">
                        <span className="text-evergreen/50 line-through">{formatBDT(r.originalPrice)}</span>{" "}
                        <span className="text-teal">{formatBDT(r.price)}</span>
                    </span>
                ) : (
                    <span className="font-semibold">{formatBDT(r.price)}</span>
                )}
                <span className="block text-xs text-evergreen/70">{r.window}</span>
            </>
        ) : (
            "–"
        );

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
                View details
            </Button>
            <SideSheet open={open} onClose={() => setOpen(false)} title={name}>
                <div className="space-y-5">
                    <p className="text-sm text-evergreen/80">{meta}</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <caption className="sr-only">Rates per slot for {name}</caption>
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
                                        <td className="py-2 pr-3">{cell(r.offPeak)}</td>
                                        <td className="py-2">{cell(r.peak)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="mt-1 text-xs text-evergreen/70">Price per slot.</p>
                    </div>
                    {facilities.length > 0 && (
                        <ul className="flex flex-wrap gap-2" aria-label="All facilities">
                            {facilities.map((f) => (
                                <li key={f} className="rounded-full bg-mint px-3 py-1 text-xs font-semibold">{f}</li>
                            ))}
                        </ul>
                    )}
                </div>
            </SideSheet>
        </>
    );
}