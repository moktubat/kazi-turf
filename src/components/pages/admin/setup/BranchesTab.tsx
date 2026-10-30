"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { slugify } from "@/lib/slug";
import { branchSchema, branchUpdateSchema } from "@/schemas/setup";
import type { Branch } from "@/types";
import { FormActions, ListInput } from "./ui";
import { useSave } from "./useSave";

const STATUS: Record<Branch["status"], { label: string; tone: Tone }> = {
    ACTIVE: { label: "Active", tone: "success" },
    COMING_SOON: { label: "Coming soon", tone: "info" },
    DISABLED: { label: "Disabled", tone: "maint" },
};

interface FormState {
    name: string;
    slug: string;
    address: string;
    phone: string;
    whatsapp: string;
    mapUrl: string;
    hours: string;
    status: Branch["status"];
    sports: string[];
}

export function BranchesTab({ branches }: { branches: Branch[] }) {
    const [editing, setEditing] = useState<Branch | "new" | null>(null);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Branches</h2>
                <Button onClick={() => setEditing("new")}>
                    <Plus size={18} aria-hidden /> Add branch
                </Button>
            </div>

            <ul className="grid gap-4 md:grid-cols-2">
                {branches.map((b) => (
                    <li key={b.id}>
                        <Card className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-lg font-bold">{b.name}</h3>
                                    <p className="text-sm text-evergreen/80">{b.address}</p>
                                </div>
                                <Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge>
                            </div>
                            <p className="text-sm text-evergreen/80">
                                {b.hours || "No hours set"} · {b.sports.length ? b.sports.join(", ") : "No sports yet"}
                            </p>
                            <Button variant="outline" onClick={() => setEditing(b)}>
                                <Pencil size={16} aria-hidden /> Edit
                            </Button>
                        </Card>
                    </li>
                ))}
            </ul>

            <SideSheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add branch" : "Edit branch"}>
                {editing && (
                    <BranchForm
                        key={editing === "new" ? "new" : editing.id}
                        branch={editing === "new" ? null : editing}
                        onDone={() => setEditing(null)}
                    />
                )}
            </SideSheet>
        </div>
    );
}

function BranchForm({ branch, onDone }: { branch: Branch | null; onDone: () => void }) {
    const isNew = !branch;
    const [f, setF] = useState<FormState>({
        name: branch?.name ?? "",
        slug: branch?.slug ?? "",
        address: branch?.address ?? "",
        phone: branch?.phone ?? "",
        whatsapp: branch?.whatsapp ?? "",
        mapUrl: branch?.mapUrl ?? "",
        hours: branch?.hours ?? "",
        status: branch?.status ?? "COMING_SOON",
        sports: branch?.sports ?? [],
    });
    const [slugTouched, setSlugTouched] = useState(false);
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

    function submit(e: React.FormEvent) {
        e.preventDefault();
        save(
            isNew ? branchSchema : branchUpdateSchema,
            isNew ? f : { ...f, id: branch.id },
            "/api/admin/setup/branches",
            isNew ? "POST" : "PATCH",
            onDone
        );
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-4" aria-label={isNew ? "Add branch" : "Edit branch"}>
            <Input
                label="Name"
                value={f.name}
                error={fields.name}
                onChange={(e) => {
                    set("name", e.target.value);
                    if (isNew && !slugTouched) set("slug", slugify(e.target.value));
                }}
            />
            <Input
                label="Slug"
                value={f.slug}
                disabled={!isNew}
                hint={isNew ? "Used as the branch ID. It cannot be changed later." : undefined}
                error={fields.slug}
                onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value);
                }}
            />
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
                label="Status"
                value={f.status}
                hint="Disabled blocks new bookings but keeps history visible."
                error={fields.status}
                onChange={(e) => set("status", e.target.value as Branch["status"])}
            >
                <option value="ACTIVE">Active (taking bookings)</option>
                <option value="COMING_SOON">Coming soon</option>
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
            <FormActions busy={busy} error={error} label={isNew ? "Add branch" : "Save changes"} onCancel={onDone} />
        </form>
    );
}