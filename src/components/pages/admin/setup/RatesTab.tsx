"use client";
import { useState } from "react";
import { AlertTriangle, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { formatBDT } from "@/lib/format";
import { DAY_NAMES, daysLabel, gridBoundaries } from "@/lib/grid";
import { toMinutes } from "@/lib/time";
import { rateDeleteSchema, rateSchema, rateUpdateSchema } from "@/schemas/setup";
import type { SetupPitch, SetupRate } from "@/types/setup";
import { Check, FormActions, num } from "./ui";
import { useSave } from "./useSave";

export function RatesTab({
    rates,
    pitches,
    coverage,
    slotMinutes,
}: {
    rates: SetupRate[];
    pitches: SetupPitch[];
    coverage: Record<string, string[]>;
    slotMinutes: number;
}) {
    const [pitchId, setPitchId] = useState(pitches[0]?.id ?? "");
    const [editing, setEditing] = useState<SetupRate | "new" | null>(null);
    const pitch = pitches.find((p) => p.id === pitchId);

    if (pitches.length === 0 || !pitch) {
        return <Card><p className="font-semibold">Add a pitch first, then set its rates.</p></Card>;
    }

    const mine = rates
        .filter((r) => r.pitchId === pitch.id)
        .sort((a, b) => a.days[0] - b.days[0] || toMinutes(a.startTime) - toMinutes(b.startTime));
    const gaps = coverage[pitch.id] ?? [];

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-56">
                    <Select label="Pitch" value={pitch.id} onChange={(e) => setPitchId(e.target.value)}>
                        {pitches.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} · {p.sport}</option>
                        ))}
                    </Select>
                </div>
                <Button onClick={() => setEditing("new")}>
                    <Plus size={18} aria-hidden /> Add rate
                </Button>
            </div>

            <p className="text-sm text-evergreen/80">
                Price per {slotMinutes}-minute slot. A change affects new bookings only. Existing bookings keep the price they were saved with.
            </p>

            {gaps.length > 0 && (
                <div role="alert" className="rounded-xl bg-held-soft p-3 text-sm text-held">
                    <p className="flex items-center gap-2 font-bold">
                        <AlertTriangle size={18} aria-hidden /> Price gaps: these slots cannot be booked until they have a price
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-6">
                        {gaps.map((g) => (
                            <li key={g}>{g}</li>
                        ))}
                    </ul>
                </div>
            )}

            {mine.length === 0 ? (
                <Card><p className="font-semibold">No rates yet for this pitch.</p></Card>
            ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                    {mine.map((r) => (
                        <li key={r.id}>
                            <Card className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="font-heading text-lg font-bold">{formatBDT(r.pricePerSlot)}</p>
                                    <Badge tone={r.tier === "Peak" ? "held" : "info"}>{r.tier}</Badge>
                                </div>
                                <p className="text-sm">
                                    {daysLabel(r.days)} · {r.startTime}–{r.endTime}
                                </p>
                                {(r.effectiveFrom || r.effectiveTo) && (
                                    <p className="text-xs text-evergreen/70">
                                        Effective {r.effectiveFrom || "always"} to {r.effectiveTo || "ongoing"}
                                    </p>
                                )}
                                {!r.aligned && (
                                    <p className="flex items-start gap-1.5 text-xs font-semibold text-held">
                                        <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" /> Not aligned to the pitch&apos;s current schedule. Edit this window.
                                    </p>
                                )}
                                <Button variant="outline" onClick={() => setEditing(r)}>
                                    <Pencil size={16} aria-hidden /> Edit
                                </Button>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <SideSheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add rate" : "Edit rate"}>
                {editing && (
                    <RateForm
                        key={editing === "new" ? "new" : editing.id}
                        pitch={pitch}
                        rate={editing === "new" ? null : editing}
                        slotMinutes={slotMinutes}
                        onDone={() => setEditing(null)}
                    />
                )}
            </SideSheet>
        </div>
    );
}

interface FormState {
    days: number[];
    tier: "Off-peak" | "Peak";
    startTime: string;
    endTime: string;
    price: string;
    effectiveFrom: string;
    effectiveTo: string;
}

function RateForm({
    pitch,
    rate,
    slotMinutes,
    onDone,
}: {
    pitch: SetupPitch;
    rate: SetupRate | null;
    slotMinutes: number;
    onDone: () => void;
}) {
    const isNew = !rate;
    const times = gridBoundaries(pitch.openTime, pitch.closeTime, slotMinutes);
    const [f, setF] = useState<FormState>({
        days: rate?.days ?? [],
        tier: rate?.tier ?? "Off-peak",
        startTime: rate?.startTime ?? times[0] ?? "",
        endTime: rate?.endTime ?? times[1] ?? "",
        price: rate ? String(rate.pricePerSlot) : "",
        effectiveFrom: rate?.effectiveFrom ?? "",
        effectiveTo: rate?.effectiveTo ?? "",
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

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
            tier: f.tier,
            effectiveFrom: f.effectiveFrom,
            effectiveTo: f.effectiveTo,
        };
        save(
            isNew ? rateSchema : rateUpdateSchema,
            isNew ? body : { ...body, id: rate.id },
            "/api/admin/setup/rates",
            isNew ? "POST" : "PATCH",
            onDone
        );
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-4" aria-label={isNew ? "Add rate" : "Edit rate"}>
            <p className="text-sm font-semibold">{pitch.name} · {pitch.openTime}–{pitch.closeTime}</p>

            <fieldset>
                <legend className="mb-1 text-sm font-semibold">Days</legend>
                <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                    {DAY_NAMES.map((name, d) => (
                        <Check key={name} label={name} checked={f.days.includes(d)} onChange={() => toggleDay(d)} />
                    ))}
                </div>
                {fields.days && <p role="alert" className="text-sm font-medium text-booked">{fields.days}</p>}
            </fieldset>

            <Select label="Rate type" value={f.tier} onChange={(e) => set("tier", e.target.value as FormState["tier"])}>
                <option value="Off-peak">Off-peak</option>
                <option value="Peak">Peak</option>
            </Select>

            <div className="grid grid-cols-2 gap-4">
                <Select label="From" value={f.startTime} error={fields.startTime} onChange={(e) => set("startTime", e.target.value)}>
                    {times.slice(0, -1).map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </Select>
                <Select label="Until" value={f.endTime} error={fields.endTime} onChange={(e) => set("endTime", e.target.value)}>
                    {times.slice(1).map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </Select>
            </div>

            <Input
                label={`Price per ${slotMinutes}-minute slot (৳)`}
                type="number"
                inputMode="numeric"
                value={f.price}
                error={fields.pricePerSlot}
                onChange={(e) => set("price", e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
                <Input label="Effective from (optional)" type="date" value={f.effectiveFrom} error={fields.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} />
                <Input label="Effective until (optional)" type="date" value={f.effectiveTo} error={fields.effectiveTo} onChange={(e) => set("effectiveTo", e.target.value)} />
            </div>

            <FormActions busy={busy} error={error} label={isNew ? "Add rate" : "Save changes"} onCancel={onDone} />

            {!isNew &&
                (confirmDelete ? (
                    <div className="space-y-2 rounded-xl bg-booked-soft p-3 text-sm">
                        <p className="font-medium text-booked">Delete this rate? Existing bookings keep their saved prices, but slots without a price cannot be booked.</p>
                        <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => save(rateDeleteSchema, { id: rate.id }, "/api/admin/setup/rates", "DELETE", onDone)}
                        >
                            Yes, delete rate
                        </Button>
                    </div>
                ) : (
                    <Button variant="ghost" className="text-booked" onClick={() => setConfirmDelete(true)}>
                        Delete this rate
                    </Button>
                ))}
        </form>
    );
}