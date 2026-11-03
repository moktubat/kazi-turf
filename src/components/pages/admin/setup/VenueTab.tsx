"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { branchUpdateSchema } from "@/schemas/setup";
import type { Branch } from "@/types";
import { FormActions, ListInput } from "./ui";
import { useSave } from "./useSave";

interface FormState {
    name: string;
    address: string;
    phone: string;
    whatsapp: string;
    mapUrl: string;
    hours: string;
    status: Branch["status"];
    sports: string[];
}

export function VenueTab({ venue }: { venue: Branch }) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold">Venue details</h2>
                <p className="mt-1 text-sm text-evergreen/80">
                    Your venue&apos;s contact information, location and operating status.
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
    });
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

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
                    hint="Disabled blocks new bookings but keeps history visible."
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
                <FormActions busy={busy} error={error} label="Save changes" onCancel={() => { }} />
            </form>
        </Card>
    );
}