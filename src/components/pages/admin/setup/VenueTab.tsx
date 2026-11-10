"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { branchUpdateSchema } from "@/schemas/setup";
import type { Branch } from "@/types";
import { FormActions } from "./ui";
import { useSave } from "./useSave";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { ImageUpload } from "./ImageUpload";

interface SportConfig {
    id: string;
    name: string;
    image: string;
    active: boolean;
}

interface FormState {
    name: string;
    address: string;
    phone: string;
    whatsapp: string;
    mapUrl: string;
    hours: string;
    status: Branch["status"];
    sports: string[];
    sportConfigs: SportConfig[];
}

function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function VenueTab({ venue }: { venue: Branch }) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold">Venue</h2>
                <p className="mt-1 text-sm text-evergreen/80">
                    Contact information, address and operating status for the venue.
                </p>
            </div>
            <VenueForm venue={venue} />
        </div>
    );
}

function VenueForm({ venue }: { venue: Branch }) {
    const [f, setF] = useState<FormState>({
        name: venue.name,
        address: venue.address,
        phone: venue.phone,
        whatsapp: venue.whatsapp,
        mapUrl: venue.mapUrl,
        hours: venue.hours,
        status: venue.status,
        sports: venue.sports,
        // Ensure sportConfigs is initialized from venue data
        sportConfigs: (venue.sportConfigs ?? []).map(sc => ({
            id: sc.id || slugify(sc.name),
            name: sc.name,
            image: sc.image || "",
            active: sc.active ?? true,
        })),
    });
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

    function updateSport(i: number, patch: Partial<SportConfig>) {
        setF((s) => ({
            ...s,
            sportConfigs: s.sportConfigs.map((sc, idx) => {
                if (idx !== i) return sc;
                const updated = { ...sc, ...patch };
                // Auto-sync slug from name if slug is empty or was auto-generated
                if (patch.name !== undefined) {
                    if (!sc.id || sc.id === slugify(sc.name)) {
                        updated.id = slugify(patch.name);
                    }
                }
                return updated;
            }),
        }));
    }

    function addSport() {
        setF((s) => ({
            ...s,
            sportConfigs: [...s.sportConfigs, { id: "", name: "", image: "", active: true }],
        }));
    }

    function removeSport(i: number) {
        setF((s) => ({
            ...s,
            sportConfigs: s.sportConfigs.filter((_, idx) => idx !== i),
        }));
    }

    /** Reorder a sport up or down. Array order = display order on the homepage. */
    function moveSport(i: number, dir: -1 | 1) {
        setF((s) => {
            const next = [...s.sportConfigs];
            const j = i + dir;
            if (j < 0 || j >= next.length) return s; // can't move past the edges
            [next[i], next[j]] = [next[j], next[i]];
            return { ...s, sportConfigs: next };
        });
    }

    function submit(e: React.FormEvent) {
        e.preventDefault();

        // CRITICAL: Derive `sports` array from `sportConfigs`.
        // This makes sportConfigs the single source of truth — no separate
        // text input to get out of sync.
        const sports = f.sportConfigs
            .filter((sc) => sc.name.trim().length > 0)
            .map((sc) => sc.name);

        // Also ensure each config has a proper id (slug)
        const sportConfigs = f.sportConfigs
            .filter((sc) => sc.name.trim().length > 0)
            .map((sc) => ({
                ...sc,
                id: sc.id || slugify(sc.name),
            }));

        console.log("[VenueTab] submit — derived sports:", sports);
        console.log("[VenueTab] submit — sportConfigs:", sportConfigs.map(c => `${c.name} (${c.id}) image:${c.image ? "yes" : "no"}`));

        save(
            branchUpdateSchema,
            { ...f, sports, sportConfigs, id: venue.id },
            "/admin/setup/branches",
            "PATCH",
            () => { }
        );
    }

    return (
        <Card>
            <form onSubmit={submit} noValidate className="space-y-4" aria-label="Edit venue details">
                <Input label="Venue name" value={f.name} error={fields.name} onChange={(e) => set("name", e.target.value)} />
                <Input label="Address" value={f.address} error={fields.address} onChange={(e) => set("address", e.target.value)} />
                <Input label="Phone" type="tel" value={f.phone} error={fields.phone} onChange={(e) => set("phone", e.target.value)} />
                <Input
                    label="WhatsApp number"
                    type="tel"
                    value={f.whatsapp}
                    hint="Official number only, e.g. 8801XXXXXXXXX."
                    error={fields.whatsapp}
                    onChange={(e) => set("whatsapp", e.target.value)}
                />
                <Input
                    label="Map link"
                    type="url"
                    placeholder="https://maps.google.com/…"
                    value={f.mapUrl}
                    error={fields.mapUrl}
                    onChange={(e) => set("mapUrl", e.target.value)}
                />
                <Input
                    label="Opening hours"
                    placeholder="06:00 AM to 12:00 AM"
                    hint="Use 12-hour format like 06:00 AM to 12:00 AM. Shown in the footer."
                    value={f.hours}
                    error={fields.hours}
                    onChange={(e) => set("hours", e.target.value)}
                />
                <Select
                    label="Operating status"
                    value={f.status}
                    hint="Disabled blocks new bookings but keeps existing bookings visible."
                    error={fields.status}
                    onChange={(e) => set("status", e.target.value as Branch["status"])}
                >
                    <option value="ACTIVE">Active (taking bookings)</option>
                    <option value="DISABLED">Disabled</option>
                </Select>

                {/* ─── Sports section — grid layout, sportConfigs is source of truth ─── */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold">
                                Sports offered
                                <span className="ml-2 text-xs font-normal text-evergreen/60">
                                    ({f.sportConfigs.filter(s => s.name.trim()).length} sports)
                                </span>
                            </p>
                            <p className="text-xs text-evergreen/70">
                                Each sport gets a hero background shown on the homepage. Add or remove sports here.
                            </p>
                        </div>
                        <Button type="button" variant="outline" onClick={addSport}>
                            <Plus size={16} aria-hidden /> Add sport
                        </Button>
                    </div>

                    {f.sportConfigs.length === 0 && (
                        <p className="rounded-xl bg-held-soft p-3 text-sm font-medium text-held">
                            No sports yet. Click &quot;Add sport&quot; to create one.
                        </p>
                    )}

                    {/* Grid of sport cards */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        {f.sportConfigs.map((s, i) => (
                            <div
                                key={i}
                                className={`relative space-y-3 rounded-2xl border-2 p-4 transition-colors ${s.active
                                    ? "border-evergreen/10 bg-surface"
                                    : "border-evergreen/5 bg-evergreen/5 opacity-75"
                                    }`}
                            >
                                {/* Card header: name + active toggle + delete */}
                                <div className="flex items-start gap-2">
                                    <Input
                                        label="Sport name"
                                        value={s.name}
                                        placeholder="e.g. Football"
                                        error={fields[`sportConfigs.${i}.name`]}
                                        onChange={(e) => updateSport(i, { name: e.target.value })}
                                        className="flex-1"
                                    />
                                    {/* Reorder controls — top sport shows on homepage first */}
                                    <div className="mt-6 flex shrink-0 flex-col gap-1">
                                        <button
                                            type="button"
                                            onClick={() => moveSport(i, -1)}
                                            disabled={i === 0}
                                            aria-label={`Move ${s.name || "sport"} up (show earlier)`}
                                            title="Move up (appears earlier on homepage)"
                                            className="inline-flex h-5 w-11 items-center justify-center rounded-md border border-evergreen/15 bg-surface text-evergreen transition-colors hover:bg-mint disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            <ChevronUp size={14} aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveSport(i, 1)}
                                            disabled={i === f.sportConfigs.length - 1}
                                            aria-label={`Move ${s.name || "sport"} down (show later)`}
                                            title="Move down (appears later on homepage)"
                                            className="inline-flex h-5 w-11 items-center justify-center rounded-md border border-evergreen/15 bg-surface text-evergreen transition-colors hover:bg-mint disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            <ChevronDown size={14} aria-hidden />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateSport(i, { active: !s.active })}
                                        className={`mt-6 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${s.active
                                            ? "bg-mint text-teal"
                                            : "bg-evergreen/10 text-evergreen/50"
                                            }`}
                                        aria-label={s.active ? "Deactivate sport" : "Activate sport"}
                                        title={s.active ? "Active (click to disable)" : "Disabled (click to activate)"}
                                    >
                                        <span className={`size-2.5 rounded-full ${s.active ? "bg-teal" : "bg-evergreen/40"}`} />
                                    </button>
                                </div>

                                {/* Slug (read-only, auto-derived) */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-evergreen/60">ID:</span>
                                        <code className="rounded bg-mint/60 px-2 py-0.5 text-xs font-mono text-teal">
                                            {s.id || slugify(s.name) || "(enter name)"}
                                        </code>
                                    </div>
                                    <span className="text-xs font-bold text-evergreen/50" title="Display order on homepage">
                                        #{i + 1}
                                    </span>
                                </div>

                                {/* Image upload */}
                                <ImageUpload
                                    label="Hero background"
                                    value={s.image}
                                    onChange={(url) => updateSport(i, { image: url })}
                                    folder="kaziturf/sports"
                                    publicIdPrefix={`sport-${s.id || i}`}
                                    hint="Shown behind the homepage hero."
                                    error={fields[`sportConfigs.${i}.image`]}
                                />

                                {/* Delete button */}
                                <button
                                    type="button"
                                    onClick={() => removeSport(i)}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-evergreen/10 py-2 text-xs font-semibold text-booked transition-colors hover:bg-booked-soft"
                                >
                                    <Trash2 size={14} aria-hidden /> Remove sport
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Hidden sports list — derived from sportConfigs on submit */}
                    <input type="hidden" value={f.sportConfigs.map(s => s.name).join(",")} readOnly />
                </div>

                <FormActions busy={busy} error={error} label="Save changes" onCancel={() => { }} />
            </form>
        </Card>
    );
}