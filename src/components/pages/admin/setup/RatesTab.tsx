"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote, Calendar, Clock, History, Pencil, Percent, Plus, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { cn } from "@/lib/cn";
import { formatBDT, formatTime12 } from "@/lib/format";
import { daysLabel, gridBoundaries } from "@/lib/grid";
import { MAX_REGULAR_DISCOUNT_PERCENT, MIN_SLOT_PRICE, applyDiscount, priceWithTemporary } from "@/lib/pricing";
import { toMinutes } from "@/lib/time";
import { rateDeleteSchema, rateSchema, rateUpdateSchema } from "@/schemas/setup";
import type { PriceAdjustment } from "@/types";
import type { SetupPitch, SetupRate } from "@/types/setup";
import { SheetSection } from "../SheetSection";
import { DayPicker, Summary, TimePicker, onGrid, slotsIn } from "./pricingUi";
import { TEMP_COPY, TemporaryPriceForm, TemporaryPriceList, tempCovers, tempTouches, type Direction } from "./SeasonalPricing";
import { Check, FormActions, num } from "./ui";
import { useSave } from "./useSave";

type Editing =
    | { kind: "regular"; rate: SetupRate | null }
    | { kind: "temporary"; direction: Direction; adjustment: PriceAdjustment | null };

const isDated = (r: SetupRate) => !!(r.effectiveFrom || r.effectiveTo);
const hasOwnAdjustment = (r: SetupRate) => !!(r.discountType && r.discountValue);
/** Older built-in INCREASE on a regular price (a discount is a normal option, not "older"). */
const hasOwnSurcharge = (r: SetupRate) => hasOwnAdjustment(r) && r.discountDirection === "SURCHARGE";

export function RatesTab({
    rates,
    pitches,
    coverage,
    adjustments,
    today,
}: {
    rates: SetupRate[];
    pitches: SetupPitch[];
    coverage: Record<string, string[]>;
    adjustments: PriceAdjustment[];
    today: string;
}) {
    const router = useRouter();
    const [editing, setEditing] = useState<Editing | null>(null);

    const sports = Array.from(new Set(pitches.map((p) => p.sport)));
    const [sportFilter, setSportFilter] = useState(sports[0] ?? "");
    const sportPitches = pitches.filter((p) => p.sport === sportFilter);
    const [pitchId, setPitchId] = useState(sportPitches[0]?.id ?? "");
    const effectivePitchId = sportPitches.some((p) => p.id === pitchId) ? pitchId : sportPitches[0]?.id ?? "";

    function changeSport(s: string) {
        setSportFilter(s);
        setPitchId(pitches.find((p) => p.sport === s)?.id ?? "");
    }

    const pitch = pitches.find((p) => p.id === effectivePitchId);
    if (pitches.length === 0 || !pitch) {
        return <Card><p className="text-sm text-evergreen/70">Add a field first, then set its slot prices.</p></Card>;
    }

    const mine = rates
        .filter((r) => r.pitchId === pitch.id)
        .sort((a, b) => Number(isDated(a)) - Number(isDated(b)) || a.days[0] - b.days[0] || toMinutes(a.startTime) - toMinutes(b.startTime));
    const gaps = coverage[pitch.id] ?? [];
    const slotMinutes = pitch.slotMinutes ?? 90;
    const done = () => {
        setEditing(null);
        router.refresh();
    };

    const OPTIONS: { key: string; icon: React.ElementType; title: string; body: string; example: string; cls: string; open: () => void }[] = [
        {
            key: "regular",
            icon: Banknote,
            title: "Regular price",
            body: "The normal price for chosen days and times. Applies every day unless a temporary price is running.",
            example: "e.g. Sun–Thu evenings ৳2,000",
            cls: "text-evergreen",
            open: () => setEditing({ kind: "regular", rate: null }),
        },
        {
            key: "up",
            icon: TrendingUp,
            title: TEMP_COPY.SURCHARGE.title,
            body: "Vacations, Eid, holidays, tournaments, busy seasons. Pick a start and end date.",
            example: "e.g. ৳2,000 → ৳2,500",
            cls: "text-held",
            open: () => setEditing({ kind: "temporary", direction: "SURCHARGE", adjustment: null }),
        },
        {
            key: "down",
            icon: TrendingDown,
            title: TEMP_COPY.DISCOUNT.title,
            body: "Ramadan, exam periods, promotions, slow seasons. Pick a start and end date.",
            example: "e.g. ৳2,000 → ৳1,500",
            cls: "text-teal",
            open: () => setEditing({ kind: "temporary", direction: "DISCOUNT", adjustment: null }),
        },
    ];

    const sheetTitle = !editing
        ? ""
        : editing.kind === "regular"
            ? editing.rate ? "Edit regular price" : "Add regular price"
            : `${editing.adjustment ? "Edit" : "Add"} ${TEMP_COPY[editing.direction].title.toLowerCase()}`;

    return (
        <div className="space-y-6">
            {/* Section heading, like the Venue / Fields / Staff tabs, so the h3s below have an h2 above them. */}
            <div>
                <h2 className="text-xl font-bold">Slot prices</h2>
                <p className="text-sm text-evergreen/70">Regular and temporary prices for each field&apos;s bookable slots.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Sport" value={sportFilter} onChange={(e) => changeSport(e.target.value)}>
                    {sports.length === 0 && <option value="">No sports yet</option>}
                    {sports.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </Select>
                <Select label="Field" value={effectivePitchId} onChange={(e) => setPitchId(e.target.value)}>
                    {sportPitches.length === 0 && <option value="">No fields for this sport</option>}
                    {sportPitches.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </Select>
            </div>

            {/* What do you want to set? — one clear choice per pricing type */}
            <section aria-labelledby="add-price-heading" className="space-y-2">
                <h3 id="add-price-heading" className="text-sm font-semibold text-evergreen/80">
                    Add a price for <strong>{pitch.name}</strong> (per {slotMinutes}-minute slot)
                </h3>
                <ul className="grid gap-3 md:grid-cols-3">
                    {OPTIONS.map((o) => {
                        const Icon = o.icon;
                        return (
                            <li key={o.key}>
                                <button
                                    type="button"
                                    onClick={o.open}
                                    className="flex h-full w-full flex-col gap-1.5 rounded-2xl border-2 border-evergreen/15 bg-surface p-4 text-left shadow-sm transition-colors hover:border-teal hover:bg-mint/30"
                                >
                                    <span className={cn("flex items-center gap-2 font-heading font-bold", o.cls)}>
                                        <Icon size={18} aria-hidden /> {o.title}
                                    </span>
                                    <span className="text-sm text-evergreen/80">{o.body}</span>
                                    <span className="text-xs text-evergreen/60">{o.example}</span>
                                    <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-teal">
                                        <Plus size={16} aria-hidden /> Add
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                <p className="flex items-start gap-2 text-xs text-evergreen/70">
                    <Wrench size={14} aria-hidden className="mt-0.5 shrink-0" />
                    <span>
                        Need to block one slot on a specific day (hold it or mark it for maintenance)? Use{" "}
                        <Link href="/admin?manage=1" className="font-semibold text-teal underline">Desk → Manage slots</Link>.
                    </span>
                </p>
            </section>

            {gaps.length > 0 && (
                <div role="alert" className="rounded-xl bg-held-soft p-3 text-sm text-held">
                    <p className="flex items-start gap-2 font-bold">
                        <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /> These slots have no regular price, so customers cannot book them
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-6">
                        {gaps.map((g) => (
                            <li key={g}>{g}</li>
                        ))}
                    </ul>
                </div>
            )}

            <section aria-labelledby="regular-heading" className="space-y-3">
                <div>
                    <h3 id="regular-heading" className="text-lg font-bold">Regular prices</h3>
                    <p className="text-sm text-evergreen/70">Changes apply to new bookings only; existing bookings keep their saved price.</p>
                </div>
                {mine.length === 0 ? (
                    <Card>
                        <p className="text-sm text-evergreen/70">No regular prices yet. Customers cannot book {pitch.name} until you add one.</p>
                    </Card>
                ) : (
                    <ul className="grid gap-3 md:grid-cols-2">
                        {mine.map((r) => {
                            const priced = applyDiscount(r.pricePerSlot, r.discountType, r.discountValue, r.discountDirection ?? "DISCOUNT");
                            return (
                                <li key={r.id}>
                                    <Card className="space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                                                {priced.hasAdjustment && (
                                                    <span className="font-heading text-sm text-evergreen/50 line-through">{formatBDT(priced.original)}</span>
                                                )}
                                                <p className={cn("font-heading text-lg font-bold", priced.hasAdjustment && (priced.hasSurcharge ? "text-held" : "text-teal"))}>
                                                    {formatBDT(priced.discounted)}
                                                </p>
                                            </div>
                                            {(isDated(r) || hasOwnSurcharge(r)) ? (
                                                <Badge tone="info">Older setting</Badge>
                                            ) : (
                                                hasOwnAdjustment(r) && <Badge tone="success">Discount</Badge>
                                            )}
                                        </div>
                                        <p className="text-sm">
                                            {daysLabel(r.days)} · {formatTime12(r.startTime)}–{formatTime12(r.endTime)}
                                        </p>
                                        {hasOwnAdjustment(r) && (
                                            <p className="text-xs text-evergreen/70">
                                                {hasOwnSurcharge(r) ? "Built-in increase: +" : "Discount: −"}
                                                {r.discountType === "PERCENT" ? `${r.discountValue}%` : formatBDT(r.discountValue!)}
                                                {!hasOwnSurcharge(r) && ` off ${formatBDT(r.pricePerSlot)}`}
                                            </p>
                                        )}
                                        {isDated(r) && (
                                            <p className="text-xs text-evergreen/70">Only {r.effectiveFrom || "…"} to {r.effectiveTo || "…"}</p>
                                        )}
                                        {(() => {
                                            // A temporary price running today replaces this price for its slots.
                                            const now = adjustments.find(
                                                (a) => today >= a.effectiveFrom && today <= a.effectiveTo && tempTouches(a, r)
                                            );
                                            if (!now) return null;
                                            // Same rule as bookings: never stacked; a reduction never beats a bigger regular discount.
                                            const p = priceWithTemporary(r, now).discounted;
                                            return (
                                                <p className={cn("text-xs font-semibold", now.direction === "SURCHARGE" ? "text-held" : "text-teal")}>
                                                    {tempCovers(now, r) ? "Today" : "Some slots today"}: {formatBDT(p)} ({now.label}, until {now.effectiveTo}).
                                                    Regular {formatBDT(priced.discounted)} returns after.
                                                </p>
                                            );
                                        })()}
                                        {!r.aligned && (
                                            <p className="flex items-start gap-1.5 text-xs font-semibold text-held">
                                                <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" /> Not aligned to the field&apos;s current slot times. Edit this price.
                                            </p>
                                        )}
                                        <div className="border-t border-evergreen/10 pt-2">
                                            <Button variant="outline" onClick={() => setEditing({ kind: "regular", rate: r })}>
                                                <Pencil size={16} aria-hidden /> Edit
                                            </Button>
                                        </div>
                                    </Card>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <section aria-labelledby="temporary-heading" className="space-y-3">
                <div>
                    <h3 id="temporary-heading" className="text-lg font-bold">Temporary prices</h3>
                    <p className="text-sm text-evergreen/70">
                        Increases and reductions for a date range. They change the regular price only on those dates, then switch off by themselves.
                    </p>
                </div>
                <TemporaryPriceList
                    pitch={pitch}
                    rates={rates}
                    adjustments={adjustments}
                    today={today}
                    onEdit={(a) => setEditing({ kind: "temporary", direction: a.direction, adjustment: a })}
                />
            </section>

            <SideSheet
                open={!!editing}
                onClose={() => setEditing(null)}
                title={sheetTitle}
                description={editing?.kind === "regular" ? "The normal price customers pay." : "A price change for a date range."}
                icon={editing?.kind === "temporary" ? (editing.direction === "SURCHARGE" ? TrendingUp : TrendingDown) : Banknote}
            >
                {editing?.kind === "regular" && (
                    <RegularPriceForm key={editing.rate?.id ?? "new"} pitch={pitch} rate={editing.rate} onDone={done} />
                )}
                {editing?.kind === "temporary" && (
                    <TemporaryPriceForm
                        key={editing.adjustment?.id ?? `new-${editing.direction}`}
                        direction={editing.direction}
                        pitch={pitch}
                        pitches={pitches}
                        rates={rates}
                        today={today}
                        adjustment={editing.adjustment}
                        onDone={done}
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
    // Older settings: only shown when editing a price that already has them.
    effectiveFrom: string;
    effectiveTo: string;
    discountType: "PERCENT" | "FIXED" | "";
    discountDirection: "DISCOUNT" | "SURCHARGE" | "";
    discountValue: string;
}

function RegularPriceForm({ pitch, rate, onDone }: { pitch: SetupPitch; rate: SetupRate | null; onDone: () => void }) {
    const isNew = !rate;
    const slotMinutes = pitch.slotMinutes ?? 90;
    const times = gridBoundaries(pitch.openTime, pitch.closeTime, slotMinutes);
    // Older options: date-limited prices and built-in INCREASES. A discount is a normal option now.
    const legacy = !!rate && (isDated(rate) || hasOwnSurcharge(rate));
    const [f, setF] = useState<FormState>({
        days: rate?.days ?? [],
        startTime: rate?.startTime ?? times[0] ?? "",
        endTime: rate?.endTime ?? times[1] ?? "",
        price: rate ? String(rate.pricePerSlot) : "",
        effectiveFrom: rate?.effectiveFrom ?? "",
        effectiveTo: rate?.effectiveTo ?? "",
        discountType: rate?.discountType ?? "",
        discountDirection: rate?.discountDirection ?? "DISCOUNT",
        discountValue: rate?.discountValue ? String(rate.discountValue) : "",
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

    const perDay = slotsIn(onGrid(times), f.startTime, f.endTime).length; // real individual slots
    const price = Number(f.price) || 0;
    const final = applyDiscount(price, f.discountType || null, Number(f.discountValue) || null, (f.discountDirection || "DISCOUNT") as "DISCOUNT" | "SURCHARGE");
    const surcharge = !!f.discountType && f.discountDirection === "SURCHARGE"; // older built-in increase
    const discountOn = !!f.discountType && !surcharge;
    const discountAmount = discountOn ? price - final.discounted : 0;

    function setDiscountOn(on: boolean) {
        setF((s) => ({ ...s, discountType: on ? s.discountType || "PERCENT" : "", discountDirection: "DISCOUNT", discountValue: on ? s.discountValue : "" }));
    }

    function clearOlderSettings() {
        setF((s) => ({
            ...s,
            effectiveFrom: "",
            effectiveTo: "",
            ...(s.discountDirection === "SURCHARGE" ? { discountType: "", discountValue: "", discountDirection: "DISCOUNT" } : {}),
        }));
    }

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const body = {
            pitchId: pitch.id,
            days: f.days,
            startTime: f.startTime,
            endTime: f.endTime,
            pricePerSlot: num(f.price),
            tier: "Off-peak",
            effectiveFrom: f.effectiveFrom,
            effectiveTo: f.effectiveTo,
            discountType: f.discountType || null,
            discountDirection: f.discountType ? f.discountDirection || "DISCOUNT" : null,
            discountValue: f.discountType && f.discountValue ? num(f.discountValue) : null,
        };
        save(isNew ? rateSchema : rateUpdateSchema, isNew ? body : { ...body, id: rate.id }, "/admin/setup/rates", isNew ? "POST" : "PATCH", onDone);
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-6" aria-label={isNew ? "Add regular price" : "Edit regular price"}>
            <div className="flex gap-3 rounded-xl bg-mint/40 p-4 text-sm">
                <Banknote size={20} aria-hidden className="shrink-0 text-teal" />
                <div>
                    <p className="font-bold">Regular price</p>
                    <p className="mt-0.5 text-evergreen/80">
                        The normal price per {slotMinutes}-minute slot on <strong>{pitch.name}</strong>. For a holiday or Ramadan price, use a{" "}
                        <strong>temporary price</strong> instead. It switches itself off after its end date.
                    </p>
                </div>
            </div>

            <SheetSection icon={Calendar} title="1. Days" description="Which days of the week this price is for.">
                <DayPicker value={f.days} onChange={(d) => set("days", d)} error={fields.days} />
            </SheetSection>

            <SheetSection icon={Clock} title="2. Time slots" description={`Slots are ${slotMinutes} minutes long, so times follow the field's slot times.`}>
                <TimePicker
                    times={times}
                    start={f.startTime}
                    end={f.endTime}
                    onChange={(s, en) => setF((x) => ({ ...x, startTime: s, endTime: en }))}
                    error={fields.startTime ?? fields.endTime}
                />
            </SheetSection>

            <SheetSection icon={Banknote} title="3. Price" description="What a customer pays for one slot.">
                <Input
                    label="Price per slot (৳)"
                    type="number"
                    inputMode="numeric"
                    value={f.price}
                    placeholder="e.g. 2000"
                    hint="Whole taka, ৳100–৳100,000."
                    error={fields.pricePerSlot}
                    onChange={(e) => set("price", e.target.value)}
                />
            </SheetSection>

            <SheetSection icon={Percent} title="4. Discount (optional)" description="Take money off this price for the days and slots above.">
                {surcharge ? (
                    <p className="text-sm text-evergreen/70">
                        This price has an older built-in increase (see Older settings below). Clear it to add a discount.
                    </p>
                ) : (
                    <div className="space-y-4">
                        <Check label="Give customers a discount on this price" checked={discountOn} onChange={setDiscountOn} />
                        {discountOn && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Select
                                    label="Discount type"
                                    value={f.discountType}
                                    onChange={(e) => set("discountType", e.target.value as FormState["discountType"])}
                                >
                                    <option value="PERCENT">Percentage (%)</option>
                                    <option value="FIXED">Fixed amount (৳)</option>
                                </Select>
                                <Input
                                    label={f.discountType === "PERCENT" ? "Discount (%)" : "Discount (৳ off)"}
                                    type="number"
                                    inputMode="numeric"
                                    value={f.discountValue}
                                    placeholder={f.discountType === "PERCENT" ? "e.g. 10" : "e.g. 200"}
                                    hint={f.discountType === "PERCENT" ? `1–${MAX_REGULAR_DISCOUNT_PERCENT}%` : `Customers must still pay at least ${formatBDT(MIN_SLOT_PRICE)}.`}
                                    error={fields.discountValue}
                                    onChange={(e) => set("discountValue", e.target.value)}
                                />
                            </div>
                        )}
                        {discountOn && price > 0 && discountAmount > 0 && (
                            <dl className="space-y-1 rounded-xl bg-mint/40 p-3 text-sm">
                                <div className="flex justify-between gap-4">
                                    <dt className="text-evergreen/70">Regular price</dt>
                                    <dd className="font-semibold">{formatBDT(price)}</dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt className="text-evergreen/70">Discount</dt>
                                    <dd className="font-semibold text-teal">−{formatBDT(discountAmount)}</dd>
                                </div>
                                <div className="flex justify-between gap-4 border-t border-evergreen/10 pt-1">
                                    <dt className="font-semibold">Customers pay</dt>
                                    <dd className="font-bold">{formatBDT(final.discounted)}</dd>
                                </div>
                            </dl>
                        )}
                        <p className="text-xs text-evergreen/70">
                            While a temporary price increase runs, the increase is charged instead of this discount. During a temporary
                            reduction, customers pay whichever is lower. The two are never added together.
                        </p>
                    </div>
                )}
            </SheetSection>

            {legacy && (
                <SheetSection
                    icon={History}
                    title="Older settings on this price"
                    description="This price was set up with options that now live under Temporary prices. You can keep them, change them, or clear them."
                >
                    {surcharge && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Select label="Built-in increase" value={f.discountType} onChange={(e) => set("discountType", e.target.value as FormState["discountType"])}>
                                <option value="PERCENT">Percentage (%)</option>
                                <option value="FIXED">Amount (৳)</option>
                            </Select>
                            <Input label="Increase" type="number" inputMode="numeric" value={f.discountValue} error={fields.discountValue} onChange={(e) => set("discountValue", e.target.value)} />
                        </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Input label="Only from" type="date" value={f.effectiveFrom} error={fields.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} />
                        <Input label="Only until" type="date" value={f.effectiveTo} error={fields.effectiveTo} onChange={(e) => set("effectiveTo", e.target.value)} />
                    </div>
                    <Button variant="outline" onClick={clearOlderSettings}>Clear older settings</Button>
                </SheetSection>
            )}

            <Summary
                title="Check before saving"
                rows={[
                    ["Type", "Regular price"],
                    ["Days", f.days.length === 7 ? "Every day" : f.days.length ? daysLabel(f.days) : "None selected"],
                    ["Time slots", f.startTime && f.endTime ? `${formatTime12(f.startTime)}–${formatTime12(f.endTime)} (${perDay} slot${perDay === 1 ? "" : "s"} a day)` : "Pick a time range"],
                    ...(f.effectiveFrom || f.effectiveTo ? [["Dates", `${f.effectiveFrom || "…"} to ${f.effectiveTo || "…"}`] as [string, string]] : []),
                    ["Normal price", price ? formatBDT(price) : "Enter a price"],
                    ...(discountOn && discountAmount > 0
                        ? [["Discount", `−${formatBDT(discountAmount)}${f.discountType === "PERCENT" ? ` (${f.discountValue}%)` : ""}`] as [string, string]]
                        : []),
                    ...(final.hasAdjustment ? [["Customers pay", formatBDT(final.discounted)] as [string, string]] : []),
                ]}
            />

            <FormActions busy={busy} error={error} label={isNew ? "Save regular price" : "Save changes"} onCancel={onDone} />

            {!isNew &&
                (confirmDelete ? (
                    <div className="space-y-2 rounded-xl bg-booked-soft p-3 text-sm">
                        <p className="font-medium text-booked">
                            Delete this price? Existing bookings keep their saved price, but slots without a price cannot be booked.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="danger" disabled={busy} onClick={() => save(rateDeleteSchema, { id: rate.id }, "/admin/setup/rates", "DELETE", onDone)}>
                                {busy ? "Deleting…" : "Delete price"}
                            </Button>
                            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                                Keep price
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button variant="ghost" className="text-booked" onClick={() => setConfirmDelete(true)}>
                        Delete this price
                    </Button>
                ))}
        </form>
    );
}
