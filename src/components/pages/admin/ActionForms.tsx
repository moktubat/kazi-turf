// Inline confirm steps for the booking drawer. No nested modals, so focus stays trapped in the sheet.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { CHECKIN_OUTSIDE_PROMPT, CHECKIN_REASON_MAX, CHECKIN_REASON_PICKS, checkInReasonError } from "@/lib/checkInReason";
import { counterDiscountAmount, counterDiscountError, type CounterDiscount, type CounterDiscountType } from "@/lib/counterDiscount";
import { extraChargeAmount, extraChargeError, EXTRA_CHARGE_REASON_MAX, type ExtraCharge } from "@/lib/extraCharge";
import { formatBDT, formatDiscount } from "@/lib/format";
import { vatTotals } from "@/lib/pricing";
import { WALKIN_NOTE_MAX, WALKIN_NOTE_PICKS, hasNotePick, toggleNotePick } from "@/lib/walkInNote";
import type { AdminBookingDto } from "@/types/admin";

export const CHECKIN_BALANCE_PROMPT = "Choose whether the customer paid the balance now or will pay later.";

interface FormProps {
    b: AdminBookingDto;
    busy: boolean;
    onSubmit: (body: unknown) => void;
    onBack: () => void;
}

function Actions({ busy, label, onBack, danger }: { busy: boolean; label: string; onBack: () => void; danger?: boolean }) {
    return (
        <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={danger ? "danger" : "primary"} className="flex-1" disabled={busy}>
                {busy ? "Working…" : label}
            </Button>
            <Button variant="ghost" onClick={onBack} disabled={busy}>
                Back
            </Button>
        </div>
    );
}

export function CheckInForm({ b, busy, onSubmit, onBack }: FormProps) {
    const [method, setMethod] = useState<"PHONE" | "NAME">("PHONE");
    const [digits, setDigits] = useState("");
    // Balance at check-in: nothing is pre-selected. Staff must say whether the customer
    // actually paid now, so cash is never recorded by accident. "Not paid yet" checks the
    // customer in with the balance still due (Checked in · Due); it is collected later.
    const [collect, setCollect] = useState<"now" | "later" | null>(null);
    const [reason, setReason] = useState("");
    const [err, setErr] = useState<string | null>(null);
    // A Super Admin re-check-in still needs a reason; outside the window it is optional.
    const reasonRequired = b.can.overrideCheckIn;
    const showReason = reasonRequired || b.checkIn.state === "OUTSIDE_WINDOW";
    const reasonErr = checkInReasonError(reason);

    function submit(e: React.FormEvent) {
        e.preventDefault();
        if (method === "PHONE" && !/^\d{4}$/.test(digits)) return setErr("Enter the last 4 digits of the phone number.");
        if (showReason && reasonRequired && reason.trim().length === 0) return setErr(CHECKIN_OUTSIDE_PROMPT);
        if (showReason && reasonErr) return setErr(reasonErr);
        if (b.can.collectBalance && collect === null) return setErr(CHECKIN_BALANCE_PROMPT);
        setErr(null);
        const r = reason.trim();
        onSubmit({
            identity: method === "PHONE" ? { method, digits } : { method },
            collectBalance: collect === "now" && b.can.collectBalance,
            ...(showReason && r ? { overrideReason: r } : {}),
        });
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Check in">
            <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Confirm the customer</legend>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="radio" name="idm" className="size-5 accent-teal" checked={method === "PHONE"} onChange={() => setMethod("PHONE")} />
                    Last 4 digits of their phone
                </label>
                {method === "PHONE" && (
                    <Input label="Last 4 digits" inputMode="numeric" autoComplete="off" maxLength={4} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))} />
                )}
                <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="radio" name="idm" className="size-5 accent-teal" checked={method === "NAME"} onChange={() => setMethod("NAME")} />
                    I confirmed the name: <strong>{b.customerName}</strong>
                </label>
            </fieldset>

            {b.can.collectBalance && (
                <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold">
                        Balance due: <span className="text-booked">{formatBDT(b.balanceDue)}</span>
                    </legend>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                        <input type="radio" name="balance" className="mt-1 size-5 accent-teal" checked={collect === "now"} onChange={() => setCollect("now")} />
                        <span>Paid now: I received {formatBDT(b.balanceDue)} in cash</span>
                    </label>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                        <input type="radio" name="balance" className="mt-1 size-5 accent-teal" checked={collect === "later"} onChange={() => setCollect("later")} />
                        <span>Not paid yet: check in with {formatBDT(b.balanceDue)} due and collect it later</span>
                    </label>
                </fieldset>
            )}

            {showReason && (
                <div className="space-y-2">
                    <p className="rounded-xl bg-held-soft p-3 text-sm font-medium text-held">
                        {b.checkIn.message} {CHECKIN_OUTSIDE_PROMPT}
                    </p>
                    <Textarea
                        label={reasonRequired ? "Reason for the override" : "Reason (optional)"}
                        rows={2}
                        value={reason}
                        maxLength={CHECKIN_REASON_MAX}
                        onChange={(e) => setReason(e.target.value)}
                        hint="Pick one below or type your own."
                    />
                    <div role="group" aria-label="Quick pick reason" className="flex flex-wrap gap-2">
                        {CHECKIN_REASON_PICKS.map((pick) => {
                            const on = reason.trim() === pick;
                            return (
                                <button
                                    key={pick}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => setReason(on ? "" : pick)}
                                    className={`min-h-11 whitespace-nowrap rounded-full border-2 px-4 font-heading text-sm font-semibold transition-colors ${on ? "border-teal bg-teal text-white" : "border-evergreen/15 bg-surface hover:border-teal"}`}
                                >
                                    {pick}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {err && <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{err}</p>}
            <Actions busy={busy} label={b.can.overrideCheckIn ? "Override check-in" : "Check in"} onBack={onBack} />
        </form>
    );
}

export function CollectForm({ b, busy, onSubmit, onBack }: FormProps) {
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({});
            }}
            className="space-y-4"
            aria-label="Collect balance"
        >
            <p className="rounded-xl bg-mint p-3 text-sm">
                Confirm you received <strong>{formatBDT(b.balanceDue)}</strong> in cash from {b.customerName}.
            </p>
            <Actions busy={busy} label={`Confirm ${formatBDT(b.balanceDue)} received`} onBack={onBack} />
        </form>
    );
}

export function CheckOutForm({ b, busy, onSubmit, onBack }: FormProps) {
    const due = b.balanceDue;
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({});
            }}
            className="space-y-4"
            aria-label="Check out"
        >
            {due > 0 ? (
                <p className="rounded-xl bg-mint p-3 text-sm">
                    Checking <strong>{b.customerName}</strong> out collects the remaining <strong>{formatBDT(due)}</strong> in
                    cash at the same time. Have you received it? The booking then closes as <strong>Checked out — payment
                        complete</strong>.
                </p>
            ) : (
                <p className="rounded-xl bg-mint p-3 text-sm">
                    Checking <strong>{b.customerName}</strong> out closes the booking as <strong>Checked out — payment
                        complete</strong>. Nothing more is due.
                </p>
            )}
            <p className="text-xs text-evergreen/70">
                The booking keeps its slots on the board. If you tap it by mistake, &apos;Undo check-out&apos; puts it back to Checked in.
            </p>
            <Actions busy={busy} label={due > 0 ? `Collect ${formatBDT(due)} and check out` : "Check out"} onBack={onBack} />
        </form>
    );
}

/** Quick reasons for the audit trail when undoing a check-out. */
const UNDO_CHECKOUT_PICKS = ["Checked out by mistake", "Customer came back to pay or play", "Fixing the payment"] as const;

export function UndoCheckOutForm({ busy, onSubmit, onBack }: FormProps) {
    const [reason, setReason] = useState("");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({ reason: reason.trim() || undefined });
            }}
            noValidate
            className="space-y-4"
            aria-label="Undo check-out"
        >
            <p className="rounded-xl bg-mint p-3 text-sm">
                This opens the booking again — it goes back to <strong>Checked in</strong> (or <strong>Booked</strong>, if it
                was never checked in). Money already collected stays collected, and the booking can be checked out again
                afterwards.
            </p>
            <Textarea
                label="Reason (optional)"
                rows={2}
                maxLength={CHECKIN_REASON_MAX}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                hint="For the audit trail. Pick one below or type your own."
            />
            <div role="group" aria-label="Quick pick reason" className="flex flex-wrap gap-2">
                {UNDO_CHECKOUT_PICKS.map((pick) => {
                    const on = reason.trim() === pick;
                    return (
                        <button
                            key={pick}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setReason(on ? "" : pick)}
                            className={`min-h-11 whitespace-nowrap rounded-full border-2 px-4 font-heading text-sm font-semibold transition-colors ${on ? "border-teal bg-teal text-white" : "border-evergreen/15 bg-surface hover:border-teal"}`}
                        >
                            {pick}
                        </button>
                    );
                })}
            </div>
            <Actions busy={busy} label="Undo check-out" onBack={onBack} />
        </form>
    );
}

export function CancelForm({ b, busy, onSubmit, onBack }: FormProps) {
    const [reason, setReason] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const moneyIn = b.advancePaid > 0;

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim().length < 5) return setErr("Add a short reason (5+ characters).");
                setErr(null);
                onSubmit({ reason: reason.trim() });
            }}
            noValidate
            className="space-y-4"
            aria-label="Cancel booking"
        >
            {moneyIn && (
                <p className="rounded-xl bg-held-soft p-3 text-sm font-medium text-held">
                    {formatBDT(b.advancePaid)} was already received. It is marked <strong>refund pending</strong> for the Super
                    Admin to settle. Nothing is refunded automatically.
                </p>
            )}
            <Textarea label="Reason for cancelling" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            {err && <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{err}</p>}
            <Actions busy={busy} label="Cancel this booking" onBack={onBack} danger />
        </form>
    );
}

export function RefundForm({ busy, onSubmit, onBack }: FormProps) {
    const [note, setNote] = useState("");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({ note: note.trim() || undefined });
            }}
            className="space-y-4"
            aria-label="Record refund"
        >
            <p className="rounded-xl bg-mint p-3 text-sm">
                Record that the refund was completed. Do this only after the money has actually been returned.
            </p>
            <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} hint="For example the refund method or reference." />
            <Actions busy={busy} label="Mark as refunded" onBack={onBack} />
        </form>
    );
}

/** Quick reasons for the audit trail when undoing a check-in. */
const UNDO_CHECKIN_PICKS = ["Added by mistake", "Wrong booking", "Fixing a note or discount"] as const;

export function UndoCheckInForm({ busy, onSubmit, onBack }: FormProps) {
    const [reason, setReason] = useState("");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({ reason: reason.trim() || undefined });
            }}
            noValidate
            className="space-y-4"
            aria-label="Undo check-in"
        >
            <p className="rounded-xl bg-mint p-3 text-sm">
                This puts the booking back to <strong>Booked</strong> — the customer is no longer checked in. Money already
                collected stays collected, and the booking can be checked in again afterwards.
            </p>
            <Textarea
                label="Reason (optional)"
                rows={2}
                maxLength={CHECKIN_REASON_MAX}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                hint="For the audit trail. Pick one below or type your own."
            />
            <div role="group" aria-label="Quick pick reason" className="flex flex-wrap gap-2">
                {UNDO_CHECKIN_PICKS.map((pick) => {
                    const on = reason.trim() === pick;
                    return (
                        <button
                            key={pick}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setReason(on ? "" : pick)}
                            className={`min-h-11 whitespace-nowrap rounded-full border-2 px-4 font-heading text-sm font-semibold transition-colors ${on ? "border-teal bg-teal text-white" : "border-evergreen/15 bg-surface hover:border-teal"}`}
                        >
                            {pick}
                        </button>
                    );
                })}
            </div>
            <Actions busy={busy} label="Undo check-in" onBack={onBack} />
        </form>
    );
}

/**
 * Add or change the counter discount after the booking was created (or clear it with an
 * empty box). The preview re-derives the totals client-side with the very same helpers
 * the server re-checks with (lib/counterDiscount + lib/pricing), so what staff confirm is
 * exactly what gets saved.
 */
export function DiscountForm({ b, busy, onSubmit, onBack }: FormProps) {
    // Prefill with the booking's current discount, so "edit" starts where it is.
    const [type, setType] = useState<CounterDiscountType>(b.discountType ?? "FIXED");
    const [value, setValue] = useState(b.discountType && b.discountValue != null ? String(b.discountValue) : "");
    const [err, setErr] = useState<string | null>(null);

    const discount: CounterDiscount | null = value.trim() === "" ? null : { type, value: Number(value) };
    const discountError = discount ? counterDiscountError(discount, b.subtotal) : null;
    const amount = discount && !discountError ? counterDiscountAmount(discount, b.subtotal) : 0;
    // An additional charge saved on the walk-in stays on the booking: added after the discount.
    const charge = b.additionalChargeAmount > 0 ? b.additionalChargeAmount : 0;
    const { vat, total } = vatTotals(b.subtotal - amount + charge, b.vatRatePercent, b.vatMode);
    // The same "paid so far" sum the panel shows.
    const paid = b.payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);
    const balance = Math.max(0, total - paid);

    function submit(e: React.FormEvent) {
        e.preventDefault();
        // An empty box clears the discount; otherwise the same rules as at the counter.
        if (discount && discountError) return setErr(discountError);
        setErr(null);
        onSubmit({ discount: amount > 0 ? discount : null });
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Add or edit discount">
            <p className="rounded-xl bg-mint p-3 text-sm">
                Add a discount off the subtotal for {b.customerName}. Leave the box empty to remove the discount. Total,
                balance and payment status are recalculated from what has already been paid.
            </p>

            <div className="grid grid-cols-[1fr_auto] items-start gap-2">
                <Input
                    label="Discount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={type === "PERCENT" ? 100 : b.subtotal}
                    placeholder="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    // Live check while typing (the same rule submit uses), so it never goes stale.
                    error={value.trim() !== "" ? discountError ?? undefined : undefined}
                    hint={type === "PERCENT" ? "Whole percent, 0–100, off the subtotal." : "Whole taka off the subtotal."}
                />
                <Select
                    label="Type"
                    aria-label="Discount type"
                    value={type}
                    onChange={(e) => setType(e.target.value as CounterDiscountType)}
                >
                    <option value="FIXED">৳ Taka</option>
                    <option value="PERCENT">% Percent</option>
                </Select>
            </div>

            <div className="rounded-xl bg-mint p-3 text-sm" aria-live="polite">
                <dl className="space-y-1.5">
                    <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd className="font-semibold">{formatBDT(b.subtotal)}</dd></div>
                    <div className={`flex justify-between gap-4 ${amount > 0 ? "text-teal" : ""}`}>
                        <dt>Discount{amount > 0 && discount?.type === "PERCENT" ? ` (${discount.value}%)` : ""}</dt>
                        <dd className="font-semibold">{formatDiscount(amount)}</dd>
                    </div>
                    {charge > 0 && (
                        <div className="flex justify-between gap-4">
                            <dt className="min-w-0 break-words text-right">Additional charge{b.additionalChargeReason ? ` · ${b.additionalChargeReason}` : ""}</dt>
                            <dd className="shrink-0 font-semibold">+{formatBDT(charge)}</dd>
                        </div>
                    )}
                    {b.vatRatePercent && vat > 0 && (
                        <div className="flex justify-between gap-4">
                            <dt>{total === b.subtotal - amount + charge ? `Includes VAT (${b.vatRatePercent}%)` : `VAT (${b.vatRatePercent}%)`}</dt>
                            <dd className="font-semibold">{formatBDT(vat)}</dd>
                        </div>
                    )}
                    <div className="flex justify-between gap-4 font-bold"><dt>Total</dt><dd>{formatBDT(total)}</dd></div>
                    <div className="flex justify-between gap-4"><dt>Paid so far</dt><dd className="font-semibold">{formatBDT(paid)}</dd></div>
                    <div className="flex justify-between gap-4 font-bold"><dt>Balance after</dt><dd>{formatBDT(balance)}</dd></div>
                </dl>
            </div>

            {paid > 0 && total < paid && (
                <p className="rounded-xl bg-held-soft p-3 text-sm font-medium text-held">
                    The new total is {formatBDT(paid - total)} less than what the customer already paid ({formatBDT(paid)}).
                    The booking counts as fully paid — settle the extra {formatBDT(paid - total)} with the customer at the
                    desk.
                </p>
            )}

            {err && <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{err}</p>}
            <Actions busy={busy} label="Save discount" onBack={onBack} />
        </form>
    );
}

/**
 * Add or change the additional charge after the booking was created (or clear it with an
 * empty amount box) — the same charge the walk-in form can add at the counter, for one
 * forgotten there or an extra service the customer takes once the slot is already
 * booked. The preview re-derives the totals client-side with the very same helpers
 * the server re-checks with (lib/extraCharge + lib/pricing), so what staff confirm is
 * exactly what gets saved.
 */
export function ChargeForm({ b, busy, onSubmit, onBack }: FormProps) {
    // Prefill with the booking's current charge, so "edit" starts where it is.
    const [reason, setReason] = useState(b.additionalChargeReason ?? "");
    const [value, setValue] = useState(b.additionalChargeAmount > 0 ? String(b.additionalChargeAmount) : "");
    const [err, setErr] = useState<string | null>(null);

    // An empty amount box removes the charge; a reason without an amount adds nothing.
    const charge: ExtraCharge | null = value.trim() === "" ? null : { reason: reason.trim() || undefined, amount: Number(value) };
    const chargeError = charge ? extraChargeError(charge) : null;
    const amount = charge && !chargeError ? extraChargeAmount(charge) : 0;
    // The counter discount already on the booking stays: the charge is added after it.
    const discount = b.discountAmount > 0 ? b.discountAmount : 0;
    const { vat, total } = vatTotals(b.subtotal - discount + amount, b.vatRatePercent, b.vatMode);
    // The same "paid so far" sum the panel shows.
    const paid = b.payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);
    const balance = Math.max(0, total - paid);

    function submit(e: React.FormEvent) {
        e.preventDefault();
        if (charge && chargeError) return setErr(chargeError);
        setErr(null);
        onSubmit({ additionalCharge: amount > 0 ? { reason: reason.trim() || undefined, amount } : null });
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Add or edit additional charge">
            <p className="rounded-xl bg-mint p-3 text-sm">
                Add an extra amount to this booking for {b.customerName} — drinks, damage, an extra service. Leave the
                amount box empty to remove the charge. Total, balance and payment status are recalculated from what has
                already been paid.
            </p>

            {/* Same two fields as the walk-in form: the reason on the left, the taka amount
                on the right. Both are optional — anything typed without an amount adds
                nothing. The fixed-width wrapper keeps the grid column narrow on mobile. */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <Input
                    label="Additional charge (optional)"
                    autoComplete="off"
                    maxLength={EXTRA_CHARGE_REASON_MAX}
                    placeholder="e.g. Drinks, damaged net"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    hint="Shown on the receipt when an amount is entered."
                />
                <div className="w-28">
                    <Input
                        label="Amount (৳)"
                        aria-label="Additional charge amount"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="0"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        // Live check while typing (the same rule submit uses), so it never goes stale.
                        error={value.trim() !== "" ? chargeError ?? undefined : undefined}
                        hint="Added to the total."
                    />
                </div>
            </div>

            <div className="rounded-xl bg-mint p-3 text-sm" aria-live="polite">
                <dl className="space-y-1.5">
                    <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd className="font-semibold">{formatBDT(b.subtotal)}</dd></div>
                    <div className={`flex justify-between gap-4 ${discount > 0 ? "text-teal" : ""}`}>
                        <dt>Discount</dt>
                        <dd className="font-semibold">{formatDiscount(discount)}</dd>
                    </div>
                    {amount > 0 && (
                        <div className="flex justify-between gap-4 text-held">
                            <dt className="min-w-0 break-words text-right">Additional charge{reason.trim() ? ` · ${reason.trim()}` : ""}</dt>
                            <dd className="shrink-0 font-semibold">+{formatBDT(amount)}</dd>
                        </div>
                    )}
                    {b.vatRatePercent && vat > 0 && (
                        <div className="flex justify-between gap-4">
                            <dt>{total === b.subtotal - discount + amount ? `Includes VAT (${b.vatRatePercent}%)` : `VAT (${b.vatRatePercent}%)`}</dt>
                            <dd className="font-semibold">{formatBDT(vat)}</dd>
                        </div>
                    )}
                    <div className="flex justify-between gap-4 font-bold"><dt>Total</dt><dd>{formatBDT(total)}</dd></div>
                    <div className="flex justify-between gap-4"><dt>Paid so far</dt><dd className="font-semibold">{formatBDT(paid)}</dd></div>
                    <div className="flex justify-between gap-4 font-bold"><dt>Balance after</dt><dd>{formatBDT(balance)}</dd></div>
                </dl>
            </div>

            {paid > 0 && total < paid && (
                <p className="rounded-xl bg-held-soft p-3 text-sm font-medium text-held">
                    The new total is {formatBDT(paid - total)} less than what the customer already paid ({formatBDT(paid)}).
                    The booking counts as fully paid — settle the extra {formatBDT(paid - total)} with the customer at the
                    desk.
                </p>
            )}

            {err && <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{err}</p>}
            <Actions busy={busy} label="Save charge" onBack={onBack} />
        </form>
    );
}

/** Add or change the staff note after the booking was created ("Paid", "Unpaid", …). */
export function NoteForm({ b, busy, onSubmit, onBack }: FormProps) {
    const [note, setNote] = useState(b.note ?? "");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                // Blank (or only spaces) removes the note — the same rule the walk-in form uses.
                onSubmit({ note: note.trim() || null });
            }}
            noValidate
            className="space-y-4"
            aria-label="Add or edit note"
        >
            <p className="rounded-xl bg-mint p-3 text-sm">
                Staff note on this booking — for example how they paid. It stays on the booking and the receipt.
            </p>
            <Textarea
                label="Note"
                rows={2}
                maxLength={WALKIN_NOTE_MAX}
                placeholder="Paid or unpaid, payment method…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                hint="Leave it empty to remove the note."
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
                            className={`min-h-11 whitespace-nowrap rounded-full border-2 px-4 font-heading text-sm font-semibold transition-colors ${on ? "border-teal bg-teal text-white" : "border-evergreen/15 bg-surface hover:border-teal"}`}
                        >
                            {pick}
                        </button>
                    );
                })}
            </div>
            <Actions busy={busy} label="Save note" onBack={onBack} />
        </form>
    );
}