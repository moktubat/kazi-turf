"use client";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { policies } from "@/data/site";
import { ApiError, api, isAbort } from "@/lib/api";
import { formatBDT, formatDateLong } from "@/lib/format";
import { isBdPhone, normalizePhone } from "@/lib/phone";
import { printReceipt } from "@/lib/printReceipt";
import type { Quote } from "@/server/pricing";
import type { AdminBookingDto, BoardPitch } from "@/types/admin";

export function WalkInForm({
    pitch,
    cellStart,
    date,
    branchName,
    onCreated,
    onClose,
}: {
    pitch: BoardPitch;
    cellStart: string;
    date: string;
    branchName: string;
    onCreated: () => void;
    onClose: () => void;
}) {
    const startIdx = pitch.cells.findIndex((c) => c.cellStart === cellStart);

    // How many consecutive open cells exist from the tapped one (capped by the pitch maximum).
    let maxCount = 0;
    for (let i = startIdx; i >= 0 && i < pitch.cells.length && maxCount < pitch.maxConsecutiveSlots; i++) {
        if (pitch.cells[i].status !== "AVAILABLE") break;
        maxCount++;
    }

    const [count, setCount] = useState(1);
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [known, setKnown] = useState<{ name: string } | null>(null);
    const [cash, setCash] = useState("");
    const [cashTouched, setCashTouched] = useState(false);
    const [quote, setQuote] = useState<Quote | null>(null);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [created, setCreated] = useState<AdminBookingDto | null>(null);

    const startsKey = useMemo(
        () => pitch.cells.slice(startIdx, startIdx + count).map((c) => c.cellStart).join("|"),
        [pitch.cells, startIdx, count]
    );
    const picked = pitch.cells.slice(startIdx, startIdx + count);

    // Server-calculated price. Staff never type a price.
    useEffect(() => {
        const ctrl = new AbortController();
        api<{ quote: Quote }>("/api/admin/quote", {
            method: "POST",
            signal: ctrl.signal,
            body: JSON.stringify({ pitchId: pitch.id, cellStarts: startsKey.split("|") }),
        })
            .then((r) => {
                setQuote(r.quote);
                setQuoteError(null);
            })
            .catch((e) => {
                if (isAbort(e)) return;
                setQuoteError(e instanceof ApiError ? e.message : "Could not price this slot.");
            });
        return () => ctrl.abort();
    }, [pitch.id, startsKey]);

    useEffect(() => {
        if (quote && !cashTouched) setCash(String(quote.total));
    }, [quote, cashTouched]);

    // Find the customer by phone.
    useEffect(() => {
        setKnown(null);
        if (!isBdPhone(phone)) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => {
            api<{ customer: { name: string } | null }>(
                `/api/admin/customers?${new URLSearchParams({ phone: normalizePhone(phone) })}`,
                { signal: ctrl.signal }
            )
                .then((r) => setKnown(r.customer))
                .catch(() => undefined);
        }, 300);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [phone]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);

        const next: Record<string, string> = {};
        if (!isBdPhone(phone)) next.phone = "Enter a valid Bangladesh mobile number";
        if (!known && name.trim().length < 2) next.name = "Enter the customer's name";
        const amount = Number(cash);
        if (!quote) next.cashReceived = "Wait for the price to load";
        else if (!Number.isInteger(amount) || amount < quote.advance || amount > quote.total) {
            next.cashReceived = `Between ${formatBDT(quote.advance)} and ${formatBDT(quote.total)}`;
        }
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        setSaving(true);
        try {
            const r = await api<{ booking: AdminBookingDto }>("/api/admin/bookings", {
                method: "POST",
                body: JSON.stringify({
                    pitchId: pitch.id,
                    cellStarts: startsKey.split("|"),
                    phone,
                    name: known ? undefined : name.trim(),
                    cashReceived: amount,
                }),
            });
            setCreated(r.booking);
            onCreated();
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.fields) setErrors(err.fields);
                setFormError(err.message);
            } else setFormError("Something went wrong. Please try again.");
        } finally {
            setSaving(false);
        }
    }

    if (created) {
        return (
            <div className="space-y-5 text-center">
                <p className="inline-flex items-center gap-2 font-heading font-bold text-teal">
                    <BadgeCheck size={22} aria-hidden /> Walk-in booked
                </p>
                <p className="font-mono text-3xl font-extrabold tracking-widest">{created.code}</p>
                <dl className="space-y-1.5 text-left text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Customer</dt><dd className="font-semibold">{created.customerName}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-evergreen/80">When</dt><dd className="font-semibold">{formatDateLong(created.date)}, {created.start}–{created.end}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Total</dt><dd className="font-semibold">{formatBDT(created.total)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Cash received</dt><dd className="font-semibold">{formatBDT(created.advancePaid)}</dd></div>
                    <div className="flex justify-between gap-4 font-bold"><dt>Balance due</dt><dd>{formatBDT(created.balanceDue)}</dd></div>
                </dl>
                <div className="flex flex-col gap-2">
                    <Button size="lg" onClick={() => printReceipt(created)}>
                        <Printer size={18} aria-hidden /> Print receipt
                    </Button>
                    <Button variant="outline" size="lg" onClick={onClose}>Done</Button>
                </div>
            </div>
        );
    }

    const cashNum = Number(cash);
    const balanceAfter = quote && Number.isFinite(cashNum) ? Math.max(0, quote.total - cashNum) : null;

    return (
        <form onSubmit={submit} noValidate className="space-y-5" aria-label="Walk-in booking">
            <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Branch</dt><dd className="font-semibold">{branchName}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Pitch</dt><dd className="font-semibold">{pitch.name}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Date</dt><dd className="font-semibold">{formatDateLong(date)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Time</dt><dd className="font-semibold">{picked[0]?.start}–{picked[picked.length - 1]?.end}</dd></div>
            </dl>

            {maxCount > 1 && (
                <fieldset>
                    <legend className="mb-1.5 text-sm font-semibold">Number of slots</legend>
                    <div className="flex gap-2">
                        {Array.from({ length: maxCount }, (_, i) => i + 1).map((n) => (
                            <button
                                key={n}
                                type="button"
                                aria-pressed={count === n}
                                onClick={() => setCount(n)}
                                className={`min-h-11 flex-1 rounded-xl border-2 font-heading font-semibold ${count === n ? "border-teal bg-teal text-white" : "border-evergreen/15 bg-white"
                                    }`}
                            >
                                {n} × {policies.slotMinutes} min
                            </button>
                        ))}
                    </div>
                </fieldset>
            )}

            <Input
                label="Customer phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="01XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={errors.phone}
                hint={known ? `Registered customer: ${known.name}` : undefined}
            />
            {!known && (
                <Input
                    label="Customer name"
                    autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={errors.name}
                />
            )}

            <div className="rounded-xl bg-mint p-3 text-sm" aria-live="polite">
                {quote ? (
                    <dl className="space-y-1.5">
                        <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd className="font-semibold">{formatBDT(quote.subtotal)}</dd></div>
                        {quote.vatRatePercent && quote.vat > 0 && (
                            <div className="flex justify-between gap-4">
                                <dt>{quote.total === quote.subtotal ? `Includes VAT (${quote.vatRatePercent}%)` : `VAT (${quote.vatRatePercent}%)`}</dt>
                                <dd className="font-semibold">{formatBDT(quote.vat)}</dd>
                            </div>
                        )}
                        <div className="flex justify-between gap-4 font-bold"><dt>Total</dt><dd>{formatBDT(quote.total)}</dd></div>
                    </dl>
                ) : quoteError ? (
                    <p role="alert" className="font-medium text-booked">{quoteError}</p>
                ) : (
                    <p>Calculating price…</p>
                )}
            </div>

            <div className="space-y-2">
                <Input
                    label="Cash received (৳)"
                    type="number"
                    inputMode="numeric"
                    min={quote?.advance}
                    max={quote?.total}
                    value={cash}
                    onChange={(e) => {
                        setCashTouched(true);
                        setCash(e.target.value);
                    }}
                    error={errors.cashReceived}
                    hint={
                        quote
                            ? `Minimum ${formatBDT(quote.advance)} (${quote.advancePercent}% advance).${balanceAfter !== null ? ` Balance after: ${formatBDT(balanceAfter)}.` : ""
                            }`
                            : undefined
                    }
                />
                {quote && (
                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => { setCashTouched(true); setCash(String(quote.total)); }}>
                            Full {formatBDT(quote.total)}
                        </Button>
                        <Button variant="secondary" className="flex-1" onClick={() => { setCashTouched(true); setCash(String(quote.advance)); }}>
                            Advance {formatBDT(quote.advance)}
                        </Button>
                    </div>
                )}
            </div>

            {formError && <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{formError}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={saving || !quote}>
                {saving ? "Creating…" : "Create booking"}
            </Button>
        </form>
    );
}