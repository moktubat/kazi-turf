"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { staffCreateSchema, staffUpdateSchema } from "@/schemas/setup";
import type { SetupStaff } from "@/types/setup";
import { Check, FormActions } from "./ui";
import { useSave } from "./useSave";
import { venue } from "@/data/branches";

const PITCHES_EDIT = "pitches.edit";

export function StaffTab({ staff }: { staff: SetupStaff[] }) {
    const [editing, setEditing] = useState<SetupStaff | "new" | null>(null);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Staff</h2>
                <Button onClick={() => setEditing("new")}>
                    <Plus size={18} aria-hidden /> Add staff
                </Button>
            </div>

            <ul className="grid gap-4 md:grid-cols-2">
                {staff.map((u) => (
                    <li key={u.id}>
                        <Card className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-lg font-bold">
                                        {u.name} {u.isSelf && <span className="text-sm font-medium text-evergreen/70">(you)</span>}
                                    </h3>
                                    <p className="text-sm text-evergreen/80">{u.phone}{u.email && ` · ${u.email}`}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <Badge tone={u.role === "SUPER_ADMIN" ? "info" : "neutral"}>{u.role === "SUPER_ADMIN" ? "Super Admin" : "Staff"}</Badge>
                                    <Badge tone={u.status === "ACTIVE" ? "success" : "maint"}>{u.status === "ACTIVE" ? "Active" : "Disabled"}</Badge>
                                </div>
                            </div>
                            <p className="text-sm">
                                {u.role === "SUPER_ADMIN" ? "Full access" : "Venue staff"}
                                {u.permissions.includes(PITCHES_EDIT) && " · can edit pitches and rates"}
                            </p>
                            <Button variant="outline" disabled={u.isSelf} onClick={() => setEditing(u)}>
                                <Pencil size={16} aria-hidden /> {u.isSelf ? "Use My account" : "Edit"}
                            </Button>
                        </Card>
                    </li>
                ))}
            </ul>

            <SideSheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add staff" : "Edit staff"}>
                {editing && (
                    <StaffForm
                        key={editing === "new" ? "new" : editing.id}
                        user={editing === "new" ? null : editing}
                        onDone={() => setEditing(null)}
                    />
                )}
            </SideSheet>
        </div>
    );
}

interface FormState {
    name: string;
    phone: string;
    email: string;
    password: string;
    role: "STAFF" | "SUPER_ADMIN";
    branchIds: string[];
    canEditPitches: boolean;
    status: "ACTIVE" | "DISABLED";
    newPassword: string;
}

function StaffForm({ user, onDone }: { user: SetupStaff | null; onDone: () => void }) {
    const isNew = !user;
    const [f, setF] = useState<FormState>({
        name: user?.name ?? "",
        phone: user?.phone ?? "",
        email: user?.email ?? "",
        password: "",
        role: user?.role ?? "STAFF",
        branchIds: user?.branchIds ?? [venue.id],
        canEditPitches: user?.permissions.includes(PITCHES_EDIT) ?? false,
        status: user?.status ?? "ACTIVE",
        newPassword: "",
    });
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
    const isAdmin = f.role === "SUPER_ADMIN";

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const access = {
            role: f.role,
            branchIds: isAdmin ? [] : [venue.id],
            permissions: !isAdmin && f.canEditPitches ? [PITCHES_EDIT] : [],
        };
        if (isNew) {
            save(
                staffCreateSchema,
                { name: f.name, phone: f.phone, email: f.email, password: f.password, ...access },
                "/api/admin/setup/staff",
                "POST",
                onDone
            );
        } else {
            save(
                staffUpdateSchema,
                { id: user.id, status: f.status, newPassword: f.newPassword, ...access },
                "/api/admin/setup/staff",
                "PATCH",
                onDone
            );
        }
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-4" aria-label={isNew ? "Add staff" : "Edit staff"}>
            {isNew ? (
                <>
                    <Input label="Name" value={f.name} error={fields.name} onChange={(e) => set("name", e.target.value)} />
                    <Input label="Phone" type="tel" value={f.phone} error={fields.phone} onChange={(e) => set("phone", e.target.value)} />
                    <Input label="Email (optional)" type="email" value={f.email} error={fields.email} onChange={(e) => set("email", e.target.value)} />
                    <Input
                        label="Temporary password"
                        type="password"
                        autoComplete="new-password"
                        hint="Share it privately. They should change it in My account."
                        value={f.password}
                        error={fields.password}
                        onChange={(e) => set("password", e.target.value)}
                    />
                </>
            ) : (
                <p className="text-sm font-semibold">{user.name} · {user.phone}</p>
            )}

            <Select label="Role" value={f.role} onChange={(e) => set("role", e.target.value as FormState["role"])}>
                <option value="STAFF">Staff — venue access</option>
                <option value="SUPER_ADMIN">Super Admin (everything)</option>
            </Select>

            {!isAdmin && (
                <Check label="Can edit pitches and rates" checked={f.canEditPitches} onChange={(v) => set("canEditPitches", v)} />
            )}

            {!isNew && (
                <>
                    <Select label="Status" value={f.status} onChange={(e) => set("status", e.target.value as FormState["status"])}>
                        <option value="ACTIVE">Active</option>
                        <option value="DISABLED">Disabled (cannot sign in)</option>
                    </Select>
                    <Input
                        label="Reset password (optional)"
                        type="password"
                        autoComplete="new-password"
                        hint="Setting a new password signs them out everywhere."
                        value={f.newPassword}
                        error={fields.newPassword}
                        onChange={(e) => set("newPassword", e.target.value)}
                    />
                </>
            )}

            <FormActions busy={busy} error={error} label={isNew ? "Create account" : "Save changes"} onCancel={onDone} />
        </form>
    );
}