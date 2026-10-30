// Inline confirm steps for the booking drawer. No nested modals, so focus stays trapped in the sheet.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { formatBDT } from "@/lib/format";
import type { AdminBookingDto } from "@/types/admin";

interface FormProps {
    b: AdminBookingDto;
    busy: boolean;
    onSubmit: (body: unknown) => void;
    onBack: () => void;
}

function Actions({ busy, label, onBack, danger }: { busy: boolean; label: string; onBack: () => void; danger?: boolean }) {
    return (
        <div className="flex gap-2">
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
    const [collect, setCollect] = useState(b.can.collectBalance);
    const [reason, setReason] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const needsReason = b.checkIn.state !== "VALID";

    function submit(e: React.FormEvent) {
        e.preventDefault();
        if (method === "PHONE" && !/^\d{4}$/.test(digits)) return setErr("Enter the last 4 digits of the phone number.");
        if (needsReason && reason.trim().length < 5) return setErr("Add a reason (5+ characters) to check in outside the normal rules.");
        setErr(null);
        onSubmit({
            identity: method === "PHONE" ? { method, digits } : { method },
            collectBalance: collect && b.can.collectBalance,
            ...(needsReason ? { overrideReason: reason.trim() } : {}),
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
                    <Input label="Last 4 digits" inputMode="numeric" maxLength={4} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))} />
                )}
                <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="radio" name="idm" className="size-5 accent-teal" checked={method === "NAME"} onChange={() => setMethod("NAME")} />
                    I confirmed the name: <strong>{b.customerName}</strong>
                </label>
            </fieldset>

            {b.can.collectBalance && (
                <label className="flex min-h-11 items-start gap-3 text-sm font-medium">
                    <input type="checkbox" className="mt-1 size-5 accent-teal" checked={collect} onChange={(e) => setCollect(e.target.checked)} />
                    <span>Collect the balance in cash now ({formatBDT(b.balanceDue)})</span>
                </label>
            )}

            {needsReason && (
                <Textarea
                    label={b.can.overrideCheckIn ? "Reason for the override" : "Reason for checking in outside the window"}
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    hint={b.checkIn.message}
                />
            )}

            {err && <p role="alert" className="text-sm font-medium text-booked">{err}</p>}
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
            {err && <p role="alert" className="text-sm font-medium text-booked">{err}</p>}
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