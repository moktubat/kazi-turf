"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { branchUpdateSchema } from "@/schemas/setup";
import type { Branch } from "@/types";
import { FormActions, ListInput } from "./ui";
import { useSave } from "./useSave";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2 } from "lucide-react";
import { ImageUpload } from "./ImageUpload";

interface FormState {
    name: string;
    address: string;
    phone: string;
    whatsapp: string;
    mapUrl: string;
    hours: string;
    status: Branch["status"];
    sports: string[];
    sportConfigs: { id: string; name: string; image: string; active: boolean }[];
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
        sportConfigs: venue.sportConfigs ?? [],
    });
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

    function updateSport(i: number, patch: Partial<FormState["sportConfigs"][0]>) {
        set("sportConfigs", f.sportConfigs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    }

    function submit(e: React.FormEvent) {
        e.preventDefault();
        save(
            branchUpdateSchema,
            { ...f, id: venue.id },
            "/api/admin/setup/branches",
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
                    placeholder="06:00 – 24:00"
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
                <ListInput
                    label="Sports offered"
                    value={f.sports}
                    placeholder="Football, Cricket"
                    hint="Separate with commas."
                    error={fields.sports}
                    onChange={(v) => set("sports", v)}
                />

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Sports & hero background</p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => set("sportConfigs", [...f.sportConfigs, { id: "", name: "", image: "", active: true }])}
                        >
                            <Plus size={16} aria-hidden /> Add sport
                        </Button>
                    </div>

                    {f.sportConfigs.map((s, i) => (
                        <div key={i} className="grid gap-3 rounded-xl border border-evergreen/10 p-3 sm:grid-cols-[1fr_1fr_auto]">
                            <Input
                                label="ID (slug)"
                                value={s.id}
                                placeholder="football"
                                onChange={(e) => updateSport(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })}
                            />
                            <Input
                                label="Display name"
                                value={s.name}
                                placeholder="Football"
                                onChange={(e) => updateSport(i, { name: e.target.value })}
                            />
                            <div className="flex items-end gap-2">
                                <label className="flex min-h-11 items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="size-5 accent-teal"
                                        checked={s.active}
                                        onChange={(e) => updateSport(i, { active: e.target.checked })}
                                    />
                                    Active
                                </label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    aria-label={`Remove sport ${i + 1}`}
                                    onClick={() => set("sportConfigs", f.sportConfigs.filter((_, idx) => idx !== i))}
                                >
                                    <Trash2 size={16} aria-hidden />
                                </Button>
                            </div>

                            <div className="sm:col-span-3">
                                <ImageUpload
                                    label={`Hero background for ${s.name || s.id || `sport ${i + 1}`}`}
                                    value={s.image}
                                    onChange={(url) => updateSport(i, { image: url })}
                                    folder="kaziturf/sports"
                                    publicIdPrefix={`sport-${s.id || i}`}
                                    hint="Shown behind the homepage hero when this sport is selected. Stored on Cloudinary."
                                    error={fields[`sportConfigs.${i}.image`]}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <FormActions busy={busy} error={error} label="Save changes" onCancel={() => { }} />
            </form>
        </Card>
    );
}