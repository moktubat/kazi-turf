"use client";
// Temporary prices: a date range (vacation, Eid, Ramadan, exams…) during which
// slot prices go UP or DOWN. Applied on top of the regular prices; the regular
// price comes back automatically after the end date.
import { useState } from "react";
import { CalendarRange, Clock, LayoutGrid, Pencil, Tag, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatBDT, formatTime12 } from "@/lib/format";
import { daysLabel, gridBoundaries } from "@/lib/grid";
import { applyDiscount, applyPriceAdjustment, priceWithTemporary } from "@/lib/pricing";
import { toMinutes } from "@/lib/time";
import { adjustmentDeleteSchema, adjustmentSchema, adjustmentUpdateSchema } from "@/schemas/setup";
import type { PriceAdjustment } from "@/types";
import type { SetupPitch, SetupRate } from "@/types/setup";
import { SheetSection } from "../SheetSection";
import { Check, FormActions, num } from "./ui";
import { useSave } from "./useSave";
import { DayPicker, Summary, TimePicker, chip } from "./pricingUi";

export type Direction = PriceAdjustment["direction"];
type Mode = PriceAdjustment["type"];

/** What customers pay on a regular price today, i.e. after its own discount (if any). */
const regularPay = (r: SetupRate) =>
    applyDiscount(r.pricePerSlot, r.discountType, r.discountValue, r.discountDirection ?? "DISCOUNT").discounted;

const COPY: Record<Direction, {
    title: string;
    short: string;
    explain: string;
    presets: string[];
    modes: { id: Mode; label: string; hint: string; field: string; placeholder: string }[];
}> = {
    SURCHARGE: {
        title: "Temporary price increase",
        short: "Increase",
        explain: "Charge more for a period, e.g. vacations, Eid, holidays, tournaments or a busy season.",
        presets: ["Vacation", "Eid", "Holiday", "Tournament", "Busy season"],
        modes: [
            { id: "PRICE", label: "Set a new price", hint: "e.g. ৳2,000 → ৳2,500", field: "New price per slot (৳)", placeholder: "e.g. 2500" },
            { id: "FIXED", label: "Add an amount", hint: "e.g. +৳500 on every slot", field: "Amount to add per slot (৳)", placeholder: "e.g. 500" },
            { id: "PERCENT", label: "Add a percentage", hint: "e.g. +25%", field: "Percentage to add (%)", placeholder: "e.g. 25" },
        ],
    },
    DISCOUNT: {
        title: "Temporary price reduction",
        short: "Reduction",
        explain: "Charge less for a period, e.g. Ramadan, exam periods, promotions or a slow season.",
        presets: ["Ramadan", "Exam period", "Promotion", "Slow season"],
        modes: [
            { id: "PRICE", label: "Set a new price", hint: "e.g. ৳2,000 → ৳1,500", field: "New price per slot (৳)", placeholder: "e.g. 1500" },
            { id: "FIXED", label: "Take off an amount", hint: "e.g. −৳500 on every slot", field: "Discount per slot (৳)", placeholder: "e.g. 500" },
            { id: "PERCENT", label: "Take off a percentage", hint: "e.g. −20%", field: "Discount (%)", placeholder: "e.g. 20" },
        ],
    },
};

export const TEMP_COPY = COPY;

const changeText = (a: Pick<PriceAdjustment, "direction" | "type" | "value">) =>
    a.type === "PRICE"
        ? `${formatBDT(a.value)} per slot`
        : `${a.direction === "SURCHARGE" ? "+" : "−"}${a.type === "PERCENT" ? `${a.value}%` : formatBDT(a.value)}`;

const slotsText = (a: Pick<PriceAdjustment, "days" | "startTime" | "endTime">) =>
    `${a.days.length === 7 ? "Every day" : daysLabel(a.days)} · ${a.startTime === "00:00" && a.endTime === "24:00" ? "all slots" : `slots starting ${formatTime12(a.startTime)}–${formatTime12(a.endTime)}`}`;

const dayCount = (from: string, to: string) =>
    from && to && to >= from ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1 : 0;

/** Does this temporary price touch this (always-on) regular price's days and times? */
export function tempTouches(a: PriceAdjustment, r: SetupRate): boolean {
    if (r.effectiveFrom || r.effectiveTo || !a.pitchIds.includes(r.pitchId)) return false;
    if (!a.days.some((d) => r.days.includes(d))) return false;
    return toMinutes(a.startTime) < toMinutes(r.endTime) && toMinutes(r.startTime) < toMinutes(a.endTime);
}

/** Does it cover EVERY slot of that regular price (all its days and its whole time window)? */
export function tempCovers(a: PriceAdjustment, r: SetupRate): boolean {
    return (
        tempTouches(a, r) &&
        r.days.every((d) => a.days.includes(d)) &&
        toMinutes(a.startTime) <= toMinutes(r.startTime) &&
        toMinutes(a.endTime) >= toMinutes(r.endTime)
    );
}

function statusOf(a: PriceAdjustment, today: string) {
    if (today < a.effectiveFrom) return { text: "Upcoming", tone: "info" as const };
    if (today > a.effectiveTo) return { text: "Ended", tone: "neutral" as const };
    return { text: "Active now", tone: "success" as const };
}

/** Cards for the temporary prices that include this field. */
export function TemporaryPriceList({
    pitch,
    rates,
    adjustments,
    today,
    onEdit,
}: {
    pitch: SetupPitch;
    rates: SetupRate[];
    adjustments: PriceAdjustment[];
    today: string;
    onEdit: (a: PriceAdjustment) => void;
}) {
    const mine = adjustments.filter((a) => a.pitchIds.includes(pitch.id));
    if (mine.length === 0) {
        return (
            <Card>
                <p className="text-sm text-evergreen/70">No temporary prices for {pitch.name}. Regular prices apply every day.</p>
            </Card>
        );
    }
    return (
        <ul className="grid gap-3 md:grid-cols-2">
            {mine.map((a) => {
                const st = statusOf(a, today);
                const up = a.direction === "SURCHARGE";
                const others = a.pitchIds.filter((id) => id !== pitch.id).length;
                const days = dayCount(a.effectiveFrom, a.effectiveTo);
                return (
                    <li key={a.id}>
                        <Card className={cn("space-y-2", st.text === "Ended" && "opacity-70")}>
                            <div className="flex items-start justify-between gap-2">
                                <p className="flex items-center gap-2 font-heading text-lg font-bold">
                                    {up ? <TrendingUp size={18} aria-hidden className="text-held" /> : <TrendingDown size={18} aria-hidden className="text-teal" />}
                                    {a.label}
                                </p>
                                <div className="flex flex-col items-end gap-1">
                                    <Badge tone={st.tone}>{st.text}</Badge>
                                    <Badge tone={up ? "held" : "success"}>{up ? "Price increase" : "Price reduction"}</Badge>
                                </div>
                            </div>
                            <p className="text-sm font-semibold">{changeText(a)}</p>
                            <p className="text-sm">
                                {a.effectiveFrom === a.effectiveTo ? a.effectiveFrom : `${a.effectiveFrom} to ${a.effectiveTo}`}{" "}
                                <span className="text-evergreen/60">({days} day{days === 1 ? "" : "s"})</span>
                            </p>
                            <p className="text-xs text-evergreen/70">
                                {slotsText(a)}
                                {others > 0 && ` · also ${others} other field${others === 1 ? "" : "s"}`}
                            </p>
                            {/* What customers pay on these dates, per regular price it changes. */}
                            {(() => {
                                const hit = rates.filter((r) => r.pitchId === pitch.id && tempTouches(a, r));
                                if (hit.length === 0) {
                                    return <p className="text-xs font-semibold text-held">No regular price covers these slots, so nothing changes.</p>;
                                }
                                return (
                                    <ul className="space-y-0.5 text-xs">
                                        {hit.slice(0, 3).map((r) => (
                                            <li key={r.id} className="flex flex-wrap justify-between gap-x-2">
                                                <span className="text-evergreen/70">{daysLabel(r.days)} {formatTime12(r.startTime)}–{formatTime12(r.endTime)}</span>
                                                <span>
                                                    <span className="text-evergreen/60">{formatBDT(regularPay(r))}</span> →{" "}
                                                    <strong className={up ? "text-held" : "text-teal"}>
                                                        {formatBDT(priceWithTemporary(r, a).discounted)}
                                                    </strong>
                                                </span>
                                            </li>
                                        ))}
                                        {hit.length > 3 && <li className="text-evergreen/60">+{hit.length - 3} more</li>}
                                    </ul>
                                );
                            })()}
                            <div className="border-t border-evergreen/10 pt-2">
                                <Button variant="outline" onClick={() => onEdit(a)}>
                                    <Pencil size={16} aria-hidden /> Edit
                                </Button>
                            </div>
                        </Card>
                    </li>
                );
            })}
        </ul>
    );
}

interface FormState {
    label: string;
    type: Mode;
    value: string;
    effectiveFrom: string;
    effectiveTo: string;
    days: number[];
    startTime: string;
    endTime: string;
    pitchIds: string[];
}

export function TemporaryPriceForm({
    direction,
    pitch,
    pitches,
    rates,
    today,
    adjustment,
    onDone,
}: {
    direction: Direction;
    pitch: SetupPitch;
    pitches: SetupPitch[];
    rates: SetupRate[];
    today: string;
    adjustment: PriceAdjustment | null;
    onDone: () => void;
}) {
    const isNew = !adjustment;
    const copy = COPY[direction];
    const up = direction === "SURCHARGE";
    const times = gridBoundaries(pitch.openTime, pitch.closeTime, pitch.slotMinutes ?? 90);
    const [f, setF] = useState<FormState>({
        label: adjustment?.label ?? "",
        type: adjustment?.type ?? "PRICE",
        value: adjustment ? String(adjustment.value) : "",
        effectiveFrom: adjustment?.effectiveFrom ?? today,
        effectiveTo: adjustment?.effectiveTo ?? "",
        days: adjustment?.days ?? [0, 1, 2, 3, 4, 5, 6],
        startTime: adjustment?.startTime ?? "00:00",
        endTime: adjustment?.endTime ?? "24:00",
        pitchIds: adjustment?.pitchIds ?? [pitch.id],
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
    const mode = copy.modes.find((m) => m.id === f.type) ?? copy.modes[0];
    const value = Number(f.value) || 0;
    const days = dayCount(f.effectiveFrom, f.effectiveTo);

    // Regular prices on THIS field that the chosen days/times touch — the summary.
    const s = toMinutes(f.startTime);
    const e = toMinutes(f.endTime);
    const affected = rates.filter(
        (r) =>
            r.pitchId === pitch.id &&
            !r.effectiveFrom &&
            !r.effectiveTo &&
            r.days.some((d) => f.days.includes(d)) &&
            toMinutes(r.startTime) < e &&
            s < toMinutes(r.endTime)
    );

    function submit(ev: React.FormEvent) {
        ev.preventDefault();
        const body = {
            label: f.label,
            direction,
            type: f.type,
            value: num(f.value),
            effectiveFrom: f.effectiveFrom,
            effectiveTo: f.effectiveTo,
            days: f.days,
            startTime: f.startTime,
            endTime: f.endTime,
            pitchIds: f.pitchIds,
        };
        save(
            isNew ? adjustmentSchema : adjustmentUpdateSchema,
            isNew ? body : { ...body, id: adjustment.id },
            "/admin/setup/adjustments",
            isNew ? "POST" : "PATCH",
            onDone
        );
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-6" aria-label={copy.title}>
            <div className={cn("flex gap-3 rounded-xl p-4 text-sm", up ? "bg-held-soft text-held" : "bg-mint/60 text-teal")}>
                {up ? <TrendingUp size={20} aria-hidden className="shrink-0" /> : <TrendingDown size={20} aria-hidden className="shrink-0" />}
                <div>
                    <p className="font-bold">{copy.title}</p>
                    <p className="mt-0.5 text-evergreen/80">
                        {copy.explain} Only the dates you pick are affected. After the end date the regular price applies again automatically.
                    </p>
                </div>
            </div>

            <SheetSection icon={Tag} title="1. Name" description="So everyone knows what this price is for.">
                <Input label="Name" value={f.label} placeholder={`e.g. ${copy.presets[0]}`} error={fields.label} onChange={(ev) => set("label", ev.target.value)} />
                <div className="flex flex-wrap gap-2">
                    {copy.presets.map((l) => (
                        <button key={l} type="button" aria-pressed={f.label === l} onClick={() => set("label", l)} className={chip(f.label === l)}>
                            {l}
                        </button>
                    ))}
                </div>
            </SheetSection>

            <SheetSection icon={CalendarRange} title="2. Dates" description="Both dates are included. For a single day, pick the same date twice.">
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Start date" type="date" value={f.effectiveFrom} error={fields.effectiveFrom} onChange={(ev) => set("effectiveFrom", ev.target.value)} />
                    <Input
                        label="End date"
                        type="date"
                        value={f.effectiveTo}
                        min={f.effectiveFrom || undefined}
                        error={fields.effectiveTo}
                        onChange={(ev) => set("effectiveTo", ev.target.value)}
                    />
                </div>
                {days > 0 && <p className="-mt-2 text-xs font-semibold text-evergreen/70">{days} day{days === 1 ? "" : "s"}</p>}
            </SheetSection>

            <SheetSection icon={Clock} title="3. Which slots" description="Leave as every day and whole day to change every slot.">
                <DayPicker value={f.days} onChange={(d) => set("days", d)} error={fields.days} />
                <TimePicker
                    times={times}
                    start={f.startTime}
                    end={f.endTime}
                    onChange={(st, en) => setF((x) => ({ ...x, startTime: st, endTime: en }))}
                    startLabel="Slots starting from"
                    error={fields.startTime ?? fields.endTime}
                    wholeDay
                />
            </SheetSection>

            <SheetSection icon={Tag} title="4. New price" description="How the price changes during these dates.">
                <fieldset className="grid gap-2 sm:grid-cols-3">
                    <legend className="sr-only">How do you want to set the price?</legend>
                    {copy.modes.map((m) => {
                        const active = f.type === m.id;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => set("type", m.id)}
                                className={cn(
                                    "rounded-xl border-2 p-3 text-left transition-colors",
                                    active ? "border-teal bg-mint/60" : "border-evergreen/15 bg-surface hover:border-teal"
                                )}
                            >
                                <span className="block text-sm font-bold">{m.label}</span>
                                <span className="block text-xs text-evergreen/70">{m.hint}</span>
                            </button>
                        );
                    })}
                </fieldset>
                <Input
                    label={mode.field}
                    type="number"
                    inputMode="numeric"
                    value={f.value}
                    placeholder={mode.placeholder}
                    hint={
                        f.type === "PRICE"
                            ? up ? "Must be higher than the normal price." : "Must be lower than the normal price."
                            : f.type === "PERCENT" ? (up ? "1–200." : "1–90.") : "Whole taka."
                    }
                    error={fields.value}
                    onChange={(ev) => set("value", ev.target.value)}
                />
            </SheetSection>

            {pitches.length > 1 && (
                <SheetSection icon={LayoutGrid} title="Also apply to" description="Optional: use the same temporary price on other fields.">
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        {pitches.map((p) => (
                            <Check
                                key={p.id}
                                label={`${p.name} (${p.sport})`}
                                checked={f.pitchIds.includes(p.id)}
                                onChange={() =>
                                    set("pitchIds", f.pitchIds.includes(p.id) ? f.pitchIds.filter((x) => x !== p.id) : [...f.pitchIds, p.id])
                                }
                            />
                        ))}
                    </div>
                    {fields.pitchIds && <p role="alert" className="text-sm font-medium text-booked">{fields.pitchIds}</p>}
                </SheetSection>
            )}

            <Summary
                title="Check before saving"
                rows={[
                    ["Type", copy.title],
                    ["Dates", f.effectiveFrom && f.effectiveTo ? `${f.effectiveFrom === f.effectiveTo ? f.effectiveFrom : `${f.effectiveFrom} to ${f.effectiveTo}`} (${days} day${days === 1 ? "" : "s"})` : "Pick a start and end date"],
                    ["Days", f.days.length === 7 ? "Every day" : f.days.length ? daysLabel(f.days) : "None selected"],
                    ["Time slots", f.startTime === "00:00" && f.endTime === "24:00" ? "Whole day (all slots)" : `Slots starting ${formatTime12(f.startTime)}–${formatTime12(f.endTime)}`],
                ]}
            >
                <p className="mt-3 text-xs font-semibold text-evergreen/70">Prices on {pitch.name}</p>
                {affected.length === 0 ? (
                    <p className="text-sm text-held">No regular price covers these days and times, so nothing will change. Add a regular price first.</p>
                ) : (
                    <ul className="mt-1 space-y-1 text-sm">
                        {affected.map((r) => {
                            const p = value > 0 ? applyPriceAdjustment(r.pricePerSlot, { direction, type: f.type, value }) : null;
                            const wrongWay = p && (up ? p.discounted <= p.original : p.discounted >= p.original);
                            // What customers actually pay (same rule as bookings): a bigger regular discount stays.
                            const pays = value > 0 ? priceWithTemporary(r, { direction, type: f.type, value }).discounted : null;
                            const keepsDiscount = !!p && pays !== null && pays < p.discounted;
                            return (
                                <li key={r.id} className="flex flex-wrap justify-between gap-x-3">
                                    <span className="text-evergreen/80">{daysLabel(r.days)} {formatTime12(r.startTime)}–{formatTime12(r.endTime)}</span>
                                    <span>
                                        Normal <span className="font-semibold">{formatBDT(regularPay(r))}</span>
                                        {" → "}
                                        {p && pays !== null ? (
                                            <>
                                                <strong className={wrongWay ? "text-booked" : up ? "text-held" : "text-teal"}>{formatBDT(pays)}</strong>
                                                {keepsDiscount && <span className="text-xs text-evergreen/70"> (its regular discount is lower, so it stays)</span>}
                                            </>
                                        ) : (
                                            <span className="text-evergreen/50">enter a value</span>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Summary>

            <FormActions busy={busy} error={error} label={isNew ? `Save ${copy.short.toLowerCase()}` : "Save changes"} onCancel={onDone} />

            {!isNew &&
                (confirmDelete ? (
                    <div className="space-y-2 rounded-xl bg-booked-soft p-3 text-sm">
                        <p className="font-medium text-booked">
                            Remove this temporary price? The regular price applies again on these dates. Existing bookings keep their saved price.
                        </p>
                        <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => save(adjustmentDeleteSchema, { id: adjustment.id }, "/admin/setup/adjustments", "DELETE", onDone)}
                        >
                            Yes, remove
                        </Button>
                    </div>
                ) : (
                    <Button variant="ghost" className="text-booked" onClick={() => setConfirmDelete(true)}>
                        Remove this temporary price
                    </Button>
                ))}
        </form>
    );
}
