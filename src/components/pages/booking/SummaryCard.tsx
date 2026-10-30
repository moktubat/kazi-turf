import { Card } from "@/components/ui/Card";
import { formatBDT, formatDateLong } from "@/lib/format";

export interface SelectionInfo {
    branchName: string;
    pitchName: string;
    sport: string;
    date: string;
    start: string;
    end: string;
    slotCount: number;
    minutes: number;
}

export interface Amounts {
    subtotal: number;
    vat: number;
    vatRate: number | null;
    total: number;
    advance: number;
    balance: number;
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
    return (
        <div className={`flex items-baseline justify-between gap-4 ${strong ? "font-bold" : ""}`}>
            <dt className={strong ? "" : "text-evergreen/80"}>{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
        </div>
    );
}

export function SummaryCard({
    info,
    amounts,
    loading,
    advancePercent,
    error,
}: {
    info: SelectionInfo | null;
    amounts: Amounts | null;
    loading: boolean;
    advancePercent: number;
    error?: string;
}) {
    return (
        <Card aria-label="Booking summary" className="space-y-4">
            <h2 className="text-lg font-bold">Your booking</h2>

            {!info ? (
                <p className="text-sm text-evergreen/70">Select a slot to see the price.</p>
            ) : (
                <>
                    <dl className="space-y-1.5 text-sm">
                        <Row label="Branch" value={info.branchName} />
                        <Row label="Pitch" value={`${info.pitchName} · ${info.sport}`} />
                        <Row label="Date" value={formatDateLong(info.date)} />
                        <Row label="Time" value={`${info.start}–${info.end}`} />
                        <Row label="Duration" value={`${info.minutes} min (${info.slotCount} ${info.slotCount === 1 ? "slot" : "slots"})`} />
                    </dl>

                    <hr className="border-evergreen/10" />

                    {error && !amounts ? (
                        <p role="alert" className="text-sm font-medium text-booked">{error}</p>
                    ) : !amounts ? (
                        <div aria-busy className="space-y-2">
                            <div className="h-4 w-full animate-pulse rounded bg-evergreen/10" />
                            <div className="h-4 w-2/3 animate-pulse rounded bg-evergreen/10" />
                        </div>
                    ) : (
                        <dl className={`space-y-1.5 text-sm ${loading ? "opacity-60" : ""}`} aria-live="polite">
                            <Row label="Subtotal" value={formatBDT(amounts.subtotal)} />
                            {/* VAT line appears only when VAT is configured (spec 10.3) */}
                            {amounts.vatRate && amounts.vat > 0 && (
                                <Row
                                    label={
                                        amounts.total === amounts.subtotal
                                            ? `Includes VAT (${amounts.vatRate}%)`
                                            : `VAT (${amounts.vatRate}%)`
                                    }
                                    value={formatBDT(amounts.vat)}
                                />
                            )}
                            <Row label="Total" value={formatBDT(amounts.total)} strong />
                            <div className="my-2 rounded-xl bg-mint p-3">
                                <Row label={`Advance due now (${advancePercent}%)`} value={formatBDT(amounts.advance)} strong />
                                <Row label="Balance payable at venue" value={formatBDT(amounts.balance)} />
                            </div>
                        </dl>
                    )}
                </>
            )}
        </Card>
    );
}