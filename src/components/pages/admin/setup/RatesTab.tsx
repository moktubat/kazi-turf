"use client";
import { useState } from "react";
import { AlertTriangle, Banknote, Calendar, CalendarRange, Clock, Pencil, Plus, Tag } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { formatBDT, formatTime12 } from "@/lib/format";
import { DAY_NAMES, daysLabel, gridBoundaries } from "@/lib/grid";
import { toMinutes } from "@/lib/time";
import { rateDeleteSchema, rateSchema, rateUpdateSchema } from "@/schemas/setup";
import type { SetupPitch, SetupRate } from "@/types/setup";
import { Check, FormActions, num } from "./ui";
import { useSave } from "./useSave";
import { SheetSection } from "../SheetSection";
import { applyDiscount } from "@/lib/pricing";

const TIME_PHASES: { label: string; from: string; until: string }[] = [
    { label: "Late Night · 12 AM – 6 AM", from: "00:00", until: "06:00" },
    { label: "Morning · 6 AM – 12 PM", from: "06:00", until: "12:00" },
    { label: "Noon · 12 PM – 5 PM", from: "12:00", until: "17:00" },
    { label: "Evening · 5 PM – 9 PM", from: "17:00", until: "21:00" },
    { label: "Night · 9 PM – 12 AM", from: "21:00", until: "24:00" },
];

export function RatesTab({
    rates,
    pitches,
    coverage,
}: {
    rates: SetupRate[];
    pitches: SetupPitch[];
    coverage: Record<string, string[]>;
}) {
    const [pitchId, setPitchId] = useState(pitches[0]?.id ?? "");
    const [editing, setEditing] = useState<SetupRate | "new" | null>(null);
    const pitch = pitches.find((p) => p.id === pitchId);

    if (pitches.length === 0 || !pitch) {
        return <Card><p className="font-semibold">Add a field first, then set its slot prices.</p></Card>;
    }

    const mine = rates
        .filter((r) => r.pitchId === pitch.id)
        .sort((a, b) => a.days[0] - b.days[0] || toMinutes(a.startTime) - toMinutes(b.startTime));
    const gaps = coverage[pitch.id] ?? [];

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-56">
                    <Select label="Field" value={pitch.id} onChange={(e) => setPitchId(e.target.value)}>
                        {pitches.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} · {p.sport}</option>
                        ))}
                    </Select>
                </div>
                <Button onClick={() => setEditing("new")}>
                    <Plus size={18} aria-hidden /> Add slot price
                </Button>
            </div>

            <p className="text-sm text-evergreen/80">
                Price per {pitch.slotMinutes ?? 90}-minute slot. Changes apply to new bookings only; existing bookings keep their saved price.
            </p>

            {gaps.length > 0 && (
                <div role="alert" className="rounded-xl bg-held-soft p-3 text-sm text-held">
                    <p className="flex items-center gap-2 font-bold">
                        <AlertTriangle size={18} aria-hidden /> Price gaps — these slots cannot be booked until priced
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-6">
                        {gaps.map((g) => (
                            <li key={g}>{g}</li>
                        ))}
                    </ul>
                </div>
            )}

            {mine.length === 0 ? (
                <Card className="space-y-2">
                    <p className="font-semibold">No slot prices yet for this field.</p>
                    <p className="text-sm text-evergreen/70">
                        Customers cannot book this field until you add at least one price.
                        Click <strong>“Add slot price”</strong> to set the price for a day range and time window.
                    </p>
                </Card>
            ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                    {mine.map((r) => {
                        const priced = applyDiscount(
                            r.pricePerSlot,
                            r.discountType,
                            r.discountValue,
                            r.discountDirection ?? "DISCOUNT"
                        );
                        return (
                            <li key={r.id}>
                                <Card className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-baseline gap-2">
                                            {priced.hasAdjustment ? (
                                                <>
                                                    <span className="font-heading text-sm text-evergreen/50 line-through">{formatBDT(priced.original)}</span>
                                                    <p className={`font-heading text-lg font-bold ${priced.hasSurcharge ? "text-held" : "text-teal"}`}>{formatBDT(priced.discounted)}</p>
                                                </>
                                            ) : (
                                                <p className="font-heading text-lg font-bold">{formatBDT(priced.discounted)}</p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            {priced.hasAdjustment && (
                                                <Badge tone="success">
                                                    {r.discountType === "PERCENT"
                                                        ? `${r.discountValue}% off`
                                                        : `${formatBDT(r.discountValue!)} off`}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm">
                                        {daysLabel(r.days)} · {formatTime12(r.startTime)}–{formatTime12(r.endTime)}
                                    </p>
                                    {(r.effectiveFrom || r.effectiveTo) && (
                                        <p className="text-xs text-evergreen/70">
                                            Effective {r.effectiveFrom || "always"} to {r.effectiveTo || "ongoing"}
                                        </p>
                                    )}
                                    {!r.aligned && (
                                        <p className="flex items-start gap-1.5 text-xs font-semibold text-held">
                                            <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" /> Not aligned to the field&apos;s current schedule. Edit this window.
                                        </p>
                                    )}
                                    <div className="border-t border-evergreen/10 pt-2">
                                        <Button variant="outline" onClick={() => setEditing(r)}>
                                            <Pencil size={16} aria-hidden /> Edit
                                        </Button>
                                    </div>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            <SideSheet
                open={!!editing}
                onClose={() => setEditing(null)}
                title={editing === "new" ? "Add slot price" : "Edit slot price"}
                description={editing === "new" ? "Set a price for a day range and time window." : "Update this price window."}
                icon={Banknote}
            >
                {editing && (
                    <RateForm
                        key={editing === "new" ? "new" : editing.id}
                        pitch={pitch}
                        rate={editing === "new" ? null : editing}
                        onDone={() => setEditing(null)}
                    />
                )}
            </SideSheet>
        </div>
    );
}

interface FormState {
    days: number[];
    startTime: string;
    endTime: string;
    price: string;
    effectiveFrom: string;
    effectiveTo: string;
    discountType: "PERCENT" | "FIXED" | "";
    discountValue: string;
}

function RateForm({ pitch, rate, onDone }: {
    pitch: SetupPitch;
    rate: SetupRate | null;
    onDone: () => void;
}) {
    const isNew = !rate;
    // Use this pitch's own slot length (fall back to the global default for legacy pitches).
    const slotMinutes = pitch.slotMinutes ?? 90;
    const times = gridBoundaries(pitch.openTime, pitch.closeTime, slotMinutes);
    const [f, setF] = useState<FormState>({
        days: rate?.days ?? [],
        startTime: rate?.startTime ?? times[0] ?? "",
        endTime: rate?.endTime ?? times[1] ?? "",
        price: rate ? String(rate.pricePerSlot) : "",
        effectiveFrom: rate?.effectiveFrom ?? "",
        effectiveTo: rate?.effectiveTo ?? "",
        discountType: rate?.discountType ?? "",
        discountValue: rate?.discountValue ? String(rate.discountValue) : "",
    });

    const [confirmDelete, setConfirmDelete] = useState(false);
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

    // How many individual time slots this price window covers. Shown as a live preview
    // so the admin understands "1 price rule = N bookable slots".
    const slotsCovered = (() => {
        if (!f.startTime || !f.endTime) return 0;
        const spanMin = toMinutes(f.endTime) - toMinutes(f.startTime);
        if (spanMin <= 0) return 0;
        return Math.round(spanMin / slotMinutes) * f.days.length;
    })();

    const toggleDay = (d: number) =>
        set("days", f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort((a, b) => a - b));

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const body = {
            pitchId: pitch.id,
            days: f.days,
            startTime: f.startTime,
            endTime: f.endTime,
            pricePerSlot: num(f.price),
            tier: "Off-peak", // field kept for data compat; UI hides it
            effectiveFrom: f.effectiveFrom,
            effectiveTo: f.effectiveTo,
            discountType: f.discountType || null,
            discountDirection: f.discountType ? "DISCOUNT" : null, // always DISCOUNT
            discountValue: f.discountType && f.discountValue ? num(f.discountValue) : null,
        };
        save(isNew ? rateSchema : rateUpdateSchema, isNew ? body : { ...body, id: rate.id }, "/admin/setup/rates", isNew ? "POST" : "PATCH", onDone);
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-6" aria-label={isNew ? "Add slot price" : "Edit slot price"}>
            {/* Plain-English intro — explains what "adding a slot price" means */}
            <div className="rounded-xl bg-mint/40 p-4 text-sm">
                <p className="font-semibold text-evergreen">
                    {isNew ? "Set a price for one or more time slots" : "Update this price window"}
                </p>
                <p className="mt-1 text-evergreen/70">
                    You are setting the price customers pay <strong>per {slotMinutes}-minute slot</strong>.
                    Pick the days, a time range, and the price. One rule can cover many slots at once.
                </p>
                <p className="mt-2 text-evergreen/70">
                    <span className="text-evergreen/70">Field:</span>{" "}
                    <strong>{pitch.name}</strong>{" "}
                    <span className="text-evergreen/70">· open {formatTime12(pitch.openTime)}–{formatTime12(pitch.closeTime)}</span>
                </p>
            </div>

            <SheetSection icon={Calendar} title="Days" description="Which weekdays this price applies to.">
                <fieldset>
                    <legend className="mb-1.5 text-sm font-semibold">Days</legend>
                    <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                        {DAY_NAMES.map((name, d) => (
                            <Check key={name} label={name} checked={f.days.includes(d)} onChange={() => toggleDay(d)} />
                        ))}
                    </div>
                    {fields.days && <p role="alert" className="text-sm font-medium text-booked">{fields.days}</p>}
                </fieldset>
            </SheetSection>

            <SheetSection icon={Clock} title="Time window" description="Must align to the field's slot grid.">
                {/* Quick-pick time phases */}
                <div className="flex flex-wrap gap-2">
                    <p className="w-full text-xs text-evergreen/60">Quick pick:</p>
                    {TIME_PHASES.map((phase) => {
                        const active = f.startTime === phase.from && f.endTime === phase.until;
                        const available = times.includes(phase.from) && times.includes(phase.until);
                        return (
                            <button
                                key={phase.label}
                                type="button"
                                aria-pressed={active}
                                disabled={!available}
                                title={available ? undefined : "Outside this field's opening hours"}
                                onClick={() => { set("startTime", phase.from); set("endTime", phase.until); }}
                                className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${active
                                    ? "border-teal bg-teal text-white"
                                    : available
                                        ? "border-evergreen/15 bg-surface text-evergreen hover:border-teal hover:bg-mint/40"
                                        : "border-evergreen/10 bg-surface text-evergreen/30 cursor-not-allowed"
                                    }`}
                            >
                                {phase.label}
                            </button>
                        );
                    })}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Select label="From" value={f.startTime} error={fields.startTime} onChange={(e) => set("startTime", e.target.value)}>
                        {times.slice(0, -1).map((t) => (
                            <option key={t} value={t}>{formatTime12(t)}</option>
                        ))}
                    </Select>
                    <Select label="Until" value={f.endTime} error={fields.endTime} onChange={(e) => set("endTime", e.target.value)}>
                        {times.slice(1).map((t) => (
                            <option key={t} value={t}>{formatTime12(t)}</option>
                        ))}
                    </Select>
                </div>
                <p className="-mt-2 text-xs text-evergreen/70">
                    Times must align to the field&apos;s {slotMinutes}-minute slot grid.
                </p>
                {/* Live preview — shows how many bookable slots this rule prices */}
                {f.startTime && f.endTime && f.days.length > 0 && (
                    <div className="rounded-lg border border-teal/30 bg-mint/50 p-3 text-sm" aria-live="polite">
                        <p className="font-semibold text-teal">
                            {slotsCovered > 0
                                ? `This will price ${slotsCovered} slot${slotsCovered === 1 ? "" : "s"}`
                                : "Pick a valid time range"}
                        </p>
                        <p className="mt-0.5 text-xs text-evergreen/70">
                            {f.days.length} day{f.days.length === 1 ? "" : "s"} ×{" "}
                            {f.startTime && f.endTime
                                ? Math.max(0, Math.round((toMinutes(f.endTime) - toMinutes(f.startTime)) / slotMinutes))
                                : 0}{" "}
                            time slot{f.startTime && f.endTime && Math.round((toMinutes(f.endTime) - toMinutes(f.startTime)) / slotMinutes) === 1 ? "" : "s"} per day
                        </p>
                    </div>
                )}
            </SheetSection>

            <SheetSection icon={Banknote} title="Price" description="Whole taka only. 100–100,000.">
                <Input
                    label={`Price per ${slotMinutes}-minute slot (৳)`}
                    type="number"
                    inputMode="numeric"
                    value={f.price}
                    placeholder="e.g. 2400"
                    hint="Whole taka only. 100–100,000."
                    error={fields.pricePerSlot}
                    onChange={(e) => set("price", e.target.value)}
                />
            </SheetSection>

            <SheetSection
                icon={Tag}
                title="Discount (optional)"
                description="Lower the slot price for promotions, off-season, etc. Surcharge is not used — everyone knows evenings cost more."
            >
                <Select
                    label="Discount type"
                    value={f.discountType}
                    onChange={(e) => set("discountType", e.target.value as FormState["discountType"])}
                >
                    <option value="">None (no discount)</option>
                    <option value="PERCENT">Percentage (%)</option>
                    <option value="FIXED">Fixed amount (৳)</option>
                </Select>

                {f.discountType && (
                    <Input
                        label={f.discountType === "PERCENT" ? "Discount percentage (%)" : "Discount amount (৳)"}
                        type="number"
                        inputMode="numeric"
                        value={f.discountValue}
                        placeholder={f.discountType === "PERCENT" ? "e.g. 20" : "e.g. 200"}
                        hint={
                            f.discountType === "PERCENT"
                                ? "1–100. E.g. 20 = 20% off."
                                : "Whole taka. Must be less than the slot price."
                        }
                        error={fields.discountValue}
                        onChange={(e) => set("discountValue", e.target.value)}
                    />
                )}

                {f.discountType && f.discountValue && f.price && (
                    (() => {
                        const priced = applyDiscount(Number(f.price) || 0, f.discountType, Number(f.discountValue) || 0, "DISCOUNT");
                        return priced.hasAdjustment ? (
                            <div className="rounded-lg border border-teal/30 bg-mint/50 p-3 text-sm" aria-live="polite">
                                <p className="text-evergreen/70">
                                    Original: <span className="line-through">{formatBDT(priced.original)}</span>
                                </p>
                                <p className="font-semibold text-teal">
                                    After discount: {formatBDT(priced.discounted)}
                                </p>
                                <p className="text-xs text-evergreen/60">
                                    Customer saves {formatBDT(priced.original - priced.discounted)}
                                </p>
                            </div>
                        ) : null;
                    })()
                )}
            </SheetSection>

            <SheetSection icon={CalendarRange} title="Effective dates" description="Leave both empty for “always”. Use these for seasonal pricing (e.g. winter rates).">
                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Effective from (optional)"
                        type="date"
                        value={f.effectiveFrom}
                        error={fields.effectiveFrom}
                        onChange={(e) => set("effectiveFrom", e.target.value)}
                    />
                    <Input
                        label="Effective until (optional)"
                        type="date"
                        value={f.effectiveTo}
                        error={fields.effectiveTo}
                        onChange={(e) => set("effectiveTo", e.target.value)}
                    />
                </div>
            </SheetSection>

            <FormActions busy={busy} error={error} label={isNew ? "Add slot price" : "Save changes"} onCancel={onDone} />

            {
                !isNew &&
                (confirmDelete ? (
                    <div className="space-y-2 rounded-xl bg-booked-soft p-3 text-sm">
                        <p className="font-medium text-booked">Delete this slot price? Existing bookings keep their saved prices, but unpriced slots cannot be booked.</p>
                        <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => save(rateDeleteSchema, { id: rate.id }, "/admin/setup/rates", "DELETE", onDone)}
                        >
                            Yes, delete
                        </Button>
                    </div>
                ) : (
                    <Button variant="ghost" className="text-booked" onClick={() => setConfirmDelete(true)}>
                        Delete this slot price
                    </Button>
                ))
            }
        </form >
    );
}