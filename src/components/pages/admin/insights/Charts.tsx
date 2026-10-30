// Server-rendered, no chart library. Every bar and cell also shows its number as text.
import { Banknote, CalendarCheck, Gauge, Hourglass } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatBDT } from "@/lib/format";
import type { InsightsData } from "@/types/insights";

const PALETTE = ["bg-teal", "bg-emerald", "bg-evergreen", "bg-held", "bg-maint"];

function Kpi({
    icon: Icon,
    label,
    value,
    sub,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <Card className="space-y-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-evergreen/70">
                <Icon size={16} aria-hidden className="text-teal" /> {label}
            </p>
            <p className="font-heading text-2xl font-extrabold">{value}</p>
            {sub && <p className="text-xs text-evergreen/70">{sub}</p>}
        </Card>
    );
}

export function KpiCards({ k }: { k: InsightsData["kpis"] }) {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={CalendarCheck} label="Bookings" value={String(k.bookings)} sub="Confirmed, checked in or completed" />
            <Kpi icon={Banknote} label="Collected" value={formatBDT(k.collected)} sub="Cash and bKash actually received" />
            <Kpi
                icon={Hourglass}
                label="Pending"
                value={formatBDT(k.pendingAmount)}
                sub={`${k.pendingCount} processing · ${formatBDT(k.balanceDue)} balance due at venue`}
            />
            <Kpi
                icon={Gauge}
                label="Occupancy"
                value={k.occupancyPct === null ? "–" : `${k.occupancyPct}%`}
                sub={k.totalCells ? `${k.bookedCells} of ${k.totalCells} slots` : "No slots in range"}
            />
        </div>
    );
}

export function RevenueChart({ data }: { data: InsightsData["revenue"] }) {
    const max = Math.max(1, ...data.rows.map((r) => r.total));

    return (
        <Card className="space-y-4">
            <div>
                <h2 className="text-lg font-bold">Collected revenue by {data.bucket}</h2>
                <p className="text-xs text-evergreen/70">By the date the payment was received. Not counting fully refunded bookings.</p>
            </div>

            <ul className="flex flex-wrap gap-3 text-xs font-semibold" aria-label="Branch legend">
                {data.branches.map((b, i) => (
                    <li key={b.id} className="inline-flex items-center gap-1.5">
                        <span aria-hidden className={`size-3 rounded-sm ${PALETTE[i % PALETTE.length]}`} /> {b.name}
                    </li>
                ))}
            </ul>

            {data.total === 0 ? (
                <p className="text-sm text-evergreen/70">No collected payments in this range.</p>
            ) : (
                <ol className="space-y-1.5">
                    {data.rows.map((r) => {
                        const detail = data.branches
                            .filter((b) => r.byBranch[b.id])
                            .map((b) => `${b.name} ${formatBDT(r.byBranch[b.id])}`)
                            .join(", ");
                        return (
                            <li key={r.key} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-2 text-xs">
                                <span className="truncate">{r.label}</span>
                                <div
                                    role="img"
                                    aria-label={`${r.label}: ${r.total ? `${formatBDT(r.total)} (${detail})` : "nothing collected"}`}
                                    className="flex h-5 overflow-hidden rounded bg-evergreen/5"
                                >
                                    {data.branches.map((b, i) =>
                                        r.byBranch[b.id] ? (
                                            <div
                                                key={b.id}
                                                className={PALETTE[i % PALETTE.length]}
                                                style={{ width: `${(r.byBranch[b.id] / max) * 100}%` }}
                                            />
                                        ) : null
                                    )}
                                </div>
                                <span className="text-right font-semibold">{r.total ? formatBDT(r.total) : "–"}</span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </Card>
    );
}

export function SourceSplit({ data }: { data: InsightsData["source"] }) {
    const rows = [
        { label: "Online (bKash)", ...data.online },
        { label: "Counter (walk-in)", ...data.counter },
    ];
    const max = Math.max(1, ...rows.map((r) => r.collected));

    return (
        <Card className="space-y-4">
            <div>
                <h2 className="text-lg font-bold">Online vs counter</h2>
                <p className="text-xs text-evergreen/70">Bookings in range and money collected.</p>
            </div>
            <ul className="space-y-3">
                {rows.map((r) => (
                    <li key={r.label} className="space-y-1">
                        <div className="flex justify-between gap-2 text-sm">
                            <span className="font-semibold">{r.label}</span>
                            <span>
                                {r.bookings} {r.bookings === 1 ? "booking" : "bookings"} · <strong>{formatBDT(r.collected)}</strong>
                            </span>
                        </div>
                        <div className="h-3 overflow-hidden rounded bg-evergreen/5" aria-hidden>
                            <div className="h-full bg-teal" style={{ width: `${(r.collected / max) * 100}%` }} />
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

export function OccupancyHeatmap({ data }: { data: InsightsData["heatmap"] }) {
    return (
        <Card className="space-y-3">
            <div>
                <h2 className="text-lg font-bold">Occupancy heatmap</h2>
                <p className="text-xs text-evergreen/70">Share of slots booked, by slot time and weekday. Maintenance slots are excluded.</p>
            </div>
            {data.times.length === 0 ? (
                <p className="text-sm text-evergreen/70">No slots in this range.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[28rem] border-separate border-spacing-1 text-center text-xs">
                        <caption className="sr-only">Occupancy percentage by slot start time and weekday</caption>
                        <thead>
                            <tr>
                                <th scope="col" className="px-2 py-1 text-left font-semibold">Slot</th>
                                {data.days.map((d) => (
                                    <th key={d} scope="col" className="px-2 py-1 font-semibold">{d}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.times.map((t, ri) => (
                                <tr key={t}>
                                    <th scope="row" className="px-2 py-1 text-left font-semibold">{t}</th>
                                    {data.cells[ri].map((v, ci) => (
                                        <td
                                            key={ci}
                                            className="rounded-md px-2 py-2 font-semibold text-evergreen"
                                            style={
                                                v === null
                                                    ? { background: "rgba(1,50,32,0.04)" }
                                                    : { background: `rgba(11,110,79,${0.06 + (v / 100) * 0.55})` }
                                            }
                                        >
                                            {v === null ? "–" : `${v}%`}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}