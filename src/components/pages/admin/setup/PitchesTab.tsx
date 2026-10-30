"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { closeOptions } from "@/lib/grid";
import { toMinutes } from "@/lib/time";
import { pitchSchema, pitchUpdateSchema } from "@/schemas/setup";
import type { Branch } from "@/types";
import type { SetupPitch } from "@/types/setup";
import { FormActions, ListInput } from "./ui";
import { useSave } from "./useSave";

interface FormState {
    branchId: string;
    name: string;
    sport: string;
    format: string;
    dimensions: string;
    surface: string;
    openTime: string;
    closeTime: string;
    maxConsecutiveSlots: number;
    facilities: string[];
    image: string;
    status: SetupPitch["status"];
}

export function PitchesTab({
    pitches,
    branches,
    slotMinutes,
}: {
    pitches: SetupPitch[];
    branches: Branch[];
    slotMinutes: number;
}) {
    const [editing, setEditing] = useState<SetupPitch | "new" | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Pitches</h2>
                <Button onClick={() => setEditing("new")} disabled={branches.length === 0}>
                    <Plus size={18} aria-hidden /> Add pitch
                </Button>
            </div>

            {branches.map((b) => {
                const list = pitches.filter((p) => p.branchId === b.id);
                return (
                    <section key={b.id} aria-label={`${b.name} pitches`} className="space-y-3">
                        <h3 className="text-base font-bold">{b.name}</h3>
                        {list.length === 0 ? (
                            <p className="text-sm text-evergreen/70">No pitches yet.</p>
                        ) : (
                            <ul className="grid gap-4 md:grid-cols-2">
                                {list.map((p) => (
                                    <li key={p.id}>
                                        <Card className="space-y-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <h4 className="text-lg font-bold">{p.name}</h4>
                                                    <p className="text-sm text-evergreen/80">
                                                        {p.sport} · {p.format} · {p.openTime}–{p.closeTime} · max {p.maxConsecutiveSlots} slots
                                                    </p>
                                                </div>
                                                <Badge tone={p.status === "ACTIVE" ? "success" : "maint"}>
                                                    {p.status === "ACTIVE" ? "Active" : "Disabled"}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-evergreen/80">
                                                {p.upcomingBookings} upcoming {p.upcomingBookings === 1 ? "booking" : "bookings"}
                                            </p>
                                            <Button variant="outline" onClick={() => setEditing(p)}>
                                                <Pencil size={16} aria-hidden /> Edit
                                            </Button>
                                        </Card>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}

            <SideSheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add pitch" : "Edit pitch"}>
                {editing && (
                    <PitchForm
                        key={editing === "new" ? "new" : editing.id}
                        pitch={editing === "new" ? null : editing}
                        branches={branches}
                        slotMinutes={slotMinutes}
                        onDone={() => setEditing(null)}
                    />
                )}
            </SideSheet>
        </div>
    );
}

function PitchForm({
    pitch,
    branches,
    slotMinutes,
    onDone,
}: {
    pitch: SetupPitch | null;
    branches: Branch[];
    slotMinutes: number;
    onDone: () => void;
}) {
    const isNew = !pitch;
    const first = branches[0];
    const [f, setF] = useState<FormState>({
        branchId: pitch?.branchId ?? first?.id ?? "",
        name: pitch?.name ?? "",
        sport: pitch?.sport ?? first?.sports[0] ?? "",
        format: pitch?.format ?? "",
        dimensions: pitch?.dimensions ?? "",
        surface: pitch?.surface ?? "",
        openTime: pitch?.openTime ?? "06:00",
        closeTime: pitch?.closeTime ?? "24:00",
        maxConsecutiveSlots: pitch?.maxConsecutiveSlots ?? 2,
        facilities: pitch?.facilities ?? [],
        image: pitch?.image ?? "",
        status: pitch?.status ?? "ACTIVE",
    });
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

    const branch = branches.find((b) => b.id === f.branchId);
    const sports = [...new Set([...(branch?.sports ?? []), ...(pitch && pitch.branchId === f.branchId ? [pitch.sport] : [])])];
    const closes = closeOptions(f.openTime, slotMinutes);
    const slotCount = Math.max(0, (toMinutes(f.closeTime) - toMinutes(f.openTime)) / slotMinutes);

    function setOpen(v: string) {
        const opts = closeOptions(v, slotMinutes);
        setF((s) => ({
            ...s,
            openTime: v,
            closeTime: opts.includes(s.closeTime) ? s.closeTime : (opts[opts.length - 1] ?? s.closeTime),
        }));
    }

    function submit(e: React.FormEvent) {
        e.preventDefault();
        save(
            isNew ? pitchSchema : pitchUpdateSchema,
            isNew ? f : { ...f, id: pitch.id },
            "/api/admin/setup/pitches",
            isNew ? "POST" : "PATCH",
            onDone
        );
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-4" aria-label={isNew ? "Add pitch" : "Edit pitch"}>
            <Select
                label="Branch"
                value={f.branchId}
                disabled={!isNew}
                onChange={(e) => {
                    const b = branches.find((x) => x.id === e.target.value);
                    setF((s) => ({ ...s, branchId: e.target.value, sport: b?.sports[0] ?? "" }));
                }}
            >
                {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                ))}
            </Select>
            <Input label="Pitch label" value={f.name} error={fields.name} onChange={(e) => set("name", e.target.value)} />
            <Select
                label="Sport"
                value={f.sport}
                error={fields.sport}
                hint={sports.length === 0 ? "Add sports to this branch first (Branches tab)." : undefined}
                onChange={(e) => set("sport", e.target.value)}
            >
                {sports.length === 0 && <option value="">No sports yet</option>}
                {sports.map((s) => (
                    <option key={s} value={s}>{s}</option>
                ))}
            </Select>
            <Input label="Format" placeholder="7-a-side" value={f.format} error={fields.format} onChange={(e) => set("format", e.target.value)} />
            <Input
                label="Dimensions"
                placeholder="Verified size, e.g. 40m × 20m"
                hint="Only enter a size the owner has verified."
                value={f.dimensions}
                error={fields.dimensions}
                onChange={(e) => set("dimensions", e.target.value)}
            />
            <Input label="Surface notes" value={f.surface} error={fields.surface} onChange={(e) => set("surface", e.target.value)} />

            <div className="grid grid-cols-2 gap-4">
                <Input label="Opens" type="time" value={f.openTime} error={fields.openTime} onChange={(e) => e.target.value && setOpen(e.target.value)} />
                <Select label="Closes" value={f.closeTime} error={fields.closeTime} onChange={(e) => set("closeTime", e.target.value)}>
                    {closes.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </Select>
            </div>
            <p className="-mt-2 text-xs text-evergreen/70">
                {slotCount} slots of {slotMinutes} minutes. Closing times are limited to whole slots.
            </p>

            <Select
                label="Max consecutive slots"
                value={String(f.maxConsecutiveSlots)}
                error={fields.maxConsecutiveSlots}
                onChange={(e) => set("maxConsecutiveSlots", Number(e.target.value))}
            >
                {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n}</option>
                ))}
            </Select>
            <ListInput
                label="Facilities"
                value={f.facilities}
                placeholder="Floodlights, Parking, Washroom"
                hint="Only list what the venue really has [CONFIRM]."
                error={fields.facilities}
                onChange={(v) => set("facilities", v)}
            />
            <Input
                label="Photo path (optional)"
                placeholder="/gallery/pitch-a.jpg"
                hint="A real photo of this pitch, saved in /public."
                value={f.image}
                error={fields.image}
                onChange={(e) => set("image", e.target.value)}
            />
            <Select
                label="Status"
                value={f.status}
                error={fields.status}
                hint={
                    pitch && pitch.upcomingBookings > 0 && f.status === "DISABLED"
                        ? `${pitch.upcomingBookings} upcoming bookings stay valid. Only new bookings are blocked.`
                        : undefined
                }
                onChange={(e) => set("status", e.target.value as SetupPitch["status"])}
            >
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
            </Select>
            <FormActions busy={busy} error={error} label={isNew ? "Add pitch" : "Save changes"} onCancel={onDone} />
        </form>
    );
}