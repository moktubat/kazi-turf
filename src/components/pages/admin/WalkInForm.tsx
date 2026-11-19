"use client";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { policies } from "@/data/site";
import { ApiError, api, isAbort } from "@/lib/api";
import { applyCounterDiscount, counterDiscountError, type CounterDiscount, type CounterDiscountType } from "@/lib/counterDiscount";
import { formatBDT, formatDateLong, formatTime12 } from "@/lib/format";
import { slotLengthMinutes } from "@/lib/time";
import { isBdPhone, normalizePhone } from "@/lib/phone";
import { printReceipt } from "@/lib/printReceipt";
import { WALKIN_NOTE_MAX, WALKIN_NOTE_PICKS, hasNotePick, toggleNotePick } from "@/lib/walkInNote";
import type { Quote } from "@/server/pricing";
import type { AdminBookingDto, BoardPitch } from "@/types/admin";

export function WalkInForm({
    pitch,
    cellStart,
    date,
    onCreated,
    onClose,
    onHoldInstead,
}: {
    pitch: BoardPitch;
    cellStart: string;
    date: string;
    onCreated: () => void;
    onClose: () => void;
    /** Opens the Hold / Maintenance panel for this slot (no booking is created). */
    onHoldInstead?: () => void;
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
    // Customer lookup, kept with the number it was for: a name is never shown for a different number.
    const [lookup, setLookup] = useState<{ phone: string; customer: { name: string } | null } | null>(null);
    // What staff typed or picked. Until then the cash field follows the quoted total (derived below).
    const [cashInput, setCashInput] = useState("");
    const [cashTouched, setCashTouched] = useState(false);
    // Staff note ("Paid", "Unpaid", …): quick picks below fill it, free text also works.
    const [note, setNote] = useState("");
    // Optional counter discount: taka or percent off the subtotal. Blank = no discount.
    const [discountType, setDiscountType] = useState<CounterDiscountType>("FIXED");
    const [discountInput, setDiscountInput] = useState("");
    // Keyed by the selection it was priced for: after the slot count changes, the old
    // price (or error) is not shown and Save stays disabled until the new one arrives.
    const [quoted, setQuoted] = useState<{ key: string; quote: Quote | null; error: string | null } | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [created, setCreated] = useState<AdminBookingDto | null>(null);

    const startsKey = useMemo(
        () => pitch.cells.slice(startIdx, startIdx + count).map((c) => c.cellStart).join("|"),
        [pitch.cells, startIdx, count]
    );
    const picked = pitch.cells.slice(startIdx, startIdx + count);
    // This field's own slot length (fields can differ: 60, 90, 120 min…).
    const tapped = pitch.cells[startIdx];
    const slotLen = tapped ? slotLengthMinutes(tapped.start, tapped.end) : policies.slotMinutes;

    // Server-calculated price. Staff never type a price.
    useEffect(() => {
        const ctrl = new AbortController();
        api<{ quote: Quote }>("/api/admin/quote", {
            method: "POST",
            signal: ctrl.signal,
            body: JSON.stringify({ pitchId: pitch.id, cellStarts: startsKey.split("|") }),
        })
            .then((r) => {
                setQuoted({ key: startsKey, quote: r.quote, error: null });
            })
            .catch((e) => {
                if (isAbort(e)) return;
                setQuoted({ key: startsKey, quote: null, error: e instanceof ApiError ? e.message : "Could not price this slot." });
            });
        return () => ctrl.abort();
    }, [pitch.id, startsKey]);
    const current = quoted?.key === startsKey ? quoted : null;
    const quote = current?.quote ?? null;
    const quoteError = current?.error ?? null;

    // Discount preview with the same rules the server applies (lib/counterDiscount).
    const discount: CounterDiscount | null =
        discountInput.trim() === "" ? null : { type: discountType, value: Number(discountInput) };
    const discountError = quote ? counterDiscountError(discount, quote.subtotal) : null;
    const priced = quote && !discountError ? applyCounterDiscount(quote, discount) : null;
    // Payable after the discount; falls back to the plain total while the discount is invalid.
    const payable = priced?.total ?? quote?.total ?? 0;

    const cash = cashTouched ? cashInput : quote ? String(payable) : "";

    // Find the customer by phone.
    const phoneKey = isBdPhone(phone) ? normalizePhone(phone) : null;
    const known = phoneKey && lookup?.phone === phoneKey ? lookup.customer : null;
    useEffect(() => {
        if (!phoneKey) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => {
            api<{ customer: { name: string } | null }>(
                `/api/admin/customers?${new URLSearchParams({ phone: phoneKey })}`,
                { signal: ctrl.signal }
            )
                .then((r) => setLookup({ phone: phoneKey, customer: r.customer }))
                .catch(() => undefined);
        }, 300);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [phoneKey]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);

        const next: Record<string, string> = {};
        if (!isBdPhone(phone)) next.phone = "Enter a valid Bangladesh mobile number";
        if (!known && name.trim().length < 2) next.name = "Enter the customer's name";
        const amount = Number(cash);
        // No minimum at the counter: 0 (no advance) up to the full total. A blank box is
        // an error, not ৳0, so "no advance" is always a deliberate choice.
        if (discountError) next.discount = discountError;
        if (!quote) next.cashReceived = "Wait for the price to load";
        else if (cash.trim() === "") next.cashReceived = "Enter the cash received (0 if none)";
        else if (!Number.isInteger(amount) || amount < 0 || amount > payable) {
            next.cashReceived = `Between ${formatBDT(0)} and ${formatBDT(payable)}`;
        }
        if (note.trim().length > WALKIN_NOTE_MAX) next.note = `Keep the note under ${WALKIN_NOTE_MAX} characters`;
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
                    discount: priced && priced.discountAmount > 0 ? discount : undefined,
                    note: note.trim() || undefined,
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
                <p role="status" className="inline-flex items-center gap-2 font-heading font-bold text-teal">
                    <BadgeCheck size={22} aria-hidden /> Walk-in booked
                </p>
                <p className="break-all font-mono text-3xl font-extrabold tracking-widest">{created.code}</p>
                <dl className="space-y-1.5 text-left text-sm">
                    <div className="flex justify-between gap-4"><dt className="shrink-0 text-evergreen/80">Customer</dt><dd className="min-w-0 break-words text-right font-semibold">{created.customerName}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="shrink-0 text-evergreen/80">When</dt><dd className="text-right font-semibold">{formatDateLong(created.date)}, {formatTime12(created.start)}–{formatTime12(created.end)}</dd></div>
                    {created.discountAmount > 0 && (
                        <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Discount</dt><dd className="font-semibold">−{formatBDT(created.discountAmount)}</dd></div>
                    )}
                    <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Total</dt><dd className="font-semibold">{formatBDT(created.total)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Cash received</dt><dd className="font-semibold">{formatBDT(created.advancePaid)}</dd></div>
                    <div className="flex justify-between gap-4 font-bold"><dt>Balance due</dt><dd>{formatBDT(created.balanceDue)}</dd></div>
                    {created.note && (
                        <div className="flex justify-between gap-4"><dt className="shrink-0 text-evergreen/80">Note</dt><dd className="min-w-0 break-words text-right font-semibold">{created.note}</dd></div>
                    )}
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
    const balanceAfter = quote && Number.isFinite(cashNum) ? Math.max(0, payable - cashNum) : null;
    const suggestedAdvance = priced?.advance ?? quote?.advance ?? 0;

    return (
        <form onSubmit={submit} noValidate className="space-y-5" aria-label="Walk-in booking">
            <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4"><dt className="shrink-0 text-evergreen/80">Field</dt><dd className="min-w-0 break-words text-right font-semibold">{pitch.name}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Date</dt><dd className="font-semibold">{formatDateLong(date)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Time</dt><dd className="font-semibold">{formatTime12(picked[0]?.start ?? "")}–{formatTime12(picked[picked.length - 1]?.end ?? "")}</dd></div>
            </dl>

            {maxCount > 1 && (
                <fieldset>
                    <legend className="mb-1.5 text-sm font-semibold">Number of slots</legend>
                    <div className="flex flex-wrap gap-2">
                        {Array.from({ length: maxCount }, (_, i) => i + 1).map((n) => (
                            <button
                                key={n}
                                type="button"
                                aria-pressed={count === n}
                                onClick={() => setCount(n)}
                                className={`min-h-11 flex-1 whitespace-nowrap rounded-xl border-2 px-3 font-heading text-sm font-semibold transition-colors ${count === n ? "border-teal bg-teal text-white" : "border-evergreen/15 bg-surface hover:border-teal"
                                    }`}
                            >
                                {n} × {slotLen} min
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

            <div className="grid grid-cols-[1fr_auto] items-start gap-2">
                <Input
                    label="Discount (optional)"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={discountType === "PERCENT" ? 100 : quote?.subtotal}
                    placeholder="0"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    // Live check while typing (the same rule submit uses), so it never goes stale.
                    error={discountInput.trim() !== "" ? discountError ?? undefined : undefined}
                    hint={discountType === "PERCENT" ? "Whole percent, 0–100, off the subtotal." : "Whole taka off the subtotal."}
                />
                <Select
                    label="Type"
                    aria-label="Discount type"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as CounterDiscountType)}
                >
                    <option value="FIXED">৳ Taka</option>
                    <option value="PERCENT">% Percent</option>
                </Select>
            </div>

            <div className="rounded-xl bg-mint p-3 text-sm" aria-live="polite">
                {quote ? (
                    <dl className="space-y-1.5">
                        {priced && priced.discountAmount > 0 ? (
                            <>
                                <div className="flex justify-between gap-4"><dt>Original price</dt><dd className="font-semibold">{formatBDT(priced.originalTotal)}</dd></div>
                                <div className="flex justify-between gap-4 text-teal">
                                    <dt>Discount{discount?.type === "PERCENT" ? ` (${discount.value}%)` : ""}</dt>
                                    <dd className="font-semibold">−{formatBDT(priced.discountAmount)}</dd>
                                </div>
                            </>
                        ) : (
                            <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd className="font-semibold">{formatBDT(quote.subtotal)}</dd></div>
                        )}
                        {quote.vatRatePercent && (priced?.vat ?? quote.vat) > 0 && (
                            <div className="flex justify-between gap-4">
                                <dt>{quote.vatMode === "inclusive" ? `Includes VAT (${quote.vatRatePercent}%)` : `VAT (${quote.vatRatePercent}%)`}</dt>
                                <dd className="font-semibold">{formatBDT(priced?.vat ?? quote.vat)}</dd>
                            </div>
                        )}
                        {priced && priced.discountAmount > 0 ? (
                            <div className="flex justify-between gap-4 font-bold"><dt>Payable</dt><dd>{formatBDT(priced.total)}</dd></div>
                        ) : (
                            <div className="flex justify-between gap-4 font-bold"><dt>Total</dt><dd>{formatBDT(quote.total)}</dd></div>
                        )}
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
                    min={0}
                    max={quote ? payable : undefined}
                    value={cash}
                    onChange={(e) => {
                        setCashTouched(true);
                        setCashInput(e.target.value);
                    }}
                    error={errors.cashReceived}
                    hint={
                        quote
                            ? `Any amount from ${formatBDT(0)} (no advance) to ${formatBDT(payable)}. ${quote.advancePercent > 0
                                ? `Suggested advance ${formatBDT(suggestedAdvance)} (${quote.advancePercent}% for this sport).`
                                : "This sport needs no advance."
                            }${balanceAfter !== null ? ` Balance after: ${formatBDT(balanceAfter)}.` : ""}`
                            : undefined
                    }
                />
                {quote && (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => { setCashTouched(true); setCashInput(String(payable)); }}>
                            Full {formatBDT(payable)}
                        </Button>
                        {suggestedAdvance > 0 && suggestedAdvance < payable && (
                            <Button variant="secondary" className="flex-1" onClick={() => { setCashTouched(true); setCashInput(String(suggestedAdvance)); }}>
                                Advance {formatBDT(suggestedAdvance)}
                            </Button>
                        )}
                        <Button variant="secondary" className="flex-1" onClick={() => { setCashTouched(true); setCashInput("0"); }}>
                            No advance {formatBDT(0)}
                        </Button>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <Textarea
                    label="Note (optional)"
                    rows={2}
                    maxLength={WALKIN_NOTE_MAX}
                    placeholder="Paid or unpaid, payment method…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    error={errors.note}
                />
                <div role="group" aria-label="Quick pick note" className="flex flex-wrap gap-2">
                    {WALKIN_NOTE_PICKS.map((pick) => {
                        const on = hasNotePick(note, pick);
                        return (
                            <button
                                key={pick}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setNote((n) => toggleNotePick(n, pick))}
                                className={`min-h-11 whitespace-nowrap rounded-full border-2 px-4 font-heading text-sm font-semibold transition-colors ${on ? "border-teal bg-teal text-white" : "border-evergreen/15 bg-surface hover:border-teal"
                                    }`}
                            >
                                {pick}
                            </button>
                        );
                    })}
                </div>
            </div>

            {formError &&<p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{formError}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={saving || !quote}>
                {saving ? "Creating…" : "Create booking"}
            </Button>
            {onHoldInstead && (
                <Button variant="ghost" className="w-full" onClick={onHoldInstead} disabled={saving}>
                    Hold or block this slot instead (no booking)
                </Button>
            )}
        </form>
    );
}