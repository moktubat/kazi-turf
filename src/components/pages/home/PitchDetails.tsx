"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SideSheet } from "@/components/ui/SideSheet";
import { formatBDT } from "@/lib/format";

export interface RateWindowView {
    period: string;
    price: number;
    originalPrice: number;
    window: string;
}

/** One weekday group with every time window that has its own price, earliest first. */
export interface RateRowView {
    days: string;
    windows: RateWindowView[];
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
    const price = (r: RateWindowView) =>
        // Any change from the regular price: a reduction (teal) or a temporary increase (held colour).
        r.price !== r.originalPrice ? (
            <span className="font-semibold">
                <span className="text-evergreen/50 line-through">{formatBDT(r.originalPrice)}</span>{" "}
                <span className={r.price > r.originalPrice ? "text-held" : "text-teal"}>{formatBDT(r.price)}</span>
            </span>
        ) : (
            <span className="font-semibold">{formatBDT(r.price)}</span>
        );

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
                View details
            </Button>
            <SideSheet open={open} onClose={() => setOpen(false)} title={name}>
                <div className="space-y-5">
                    <p className="text-sm text-evergreen/80">{meta}</p>
                    {rows.length === 0 ? (
                        <p className="text-sm text-evergreen/70">Prices for this field are not set yet.</p>
                    ) : (
                    <div className="scrollbar-thin overflow-x-auto">
                        <table className="w-full min-w-[18rem] text-left text-sm">
                            <caption className="sr-only">Rates per slot for {name}</caption>
                            <thead>
                                <tr className="border-b border-evergreen/10 text-xs uppercase tracking-wide text-evergreen/70">
                                    <th scope="col" className="py-2 pr-3 font-semibold">Days</th>
                                    <th scope="col" className="py-2 pr-3 font-semibold">Time</th>
                                    <th scope="col" className="py-2 text-right font-semibold">Price</th>
                                </tr>
                            </thead>
                            {rows.map((r) => (
                                // One <tbody> per weekday group, so the group's border sits under its last window.
                                <tbody key={r.days} className="border-b border-evergreen/5 last:border-0">
                                    {r.windows.map((w, i) => (
                                        <tr key={w.window}>
                                            {i === 0 && (
                                                <th scope="rowgroup" rowSpan={r.windows.length} className="py-2 pr-3 align-top font-semibold">
                                                    {r.days}
                                                </th>
                                            )}
                                            <td className="py-2 pr-3">
                                                <span className="font-semibold">{w.period}</span>
                                                <span className="block text-xs text-evergreen/70">{w.window}</span>
                                            </td>
                                            <td className="py-2 text-right align-top">{price(w)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            ))}
                        </table>
                        <p className="mt-1 text-xs text-evergreen/70">Price per slot.</p>
                    </div>
                    )}
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
