"use client";
import { useState } from "react";
import { Clock, FileEdit, Plus, Ruler, ToggleLeft, Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { ApiError, api } from "@/lib/api";
import { closeOptions } from "@/lib/grid";
import { toMinutes } from "@/lib/time";
import { pitchSchema, pitchUpdateSchema } from "@/schemas/setup";
import type { SetupPitch } from "@/types/setup";
import { venue } from "@/data/branches";
import { FormActions, ListInput } from "./ui";
import { useSave } from "./useSave";
import { ImageUpload } from "./ImageUpload";
import { SheetSection } from "../SheetSection";
import { formatTime12 } from "@/lib/format";

const FORMAT_PRESETS = [
    "5 vs 5",
    "6 vs 6",
    "7 vs 7",
    "8 vs 8",
    "11 vs 11",
    "Net practice",
    "Single net",
    "Doubles",
] as const;

const SURFACE_PRESETS = [
    "Artificial turf",
    "Turf wicket",
    "Wooden floor",
    "Concrete",
    "Clay",
] as const;

const FACILITY_PRESETS = [
    "Floodlights",
    "Parking",
    "Washroom",
    "Drinking water",
    "Changing room",
] as const;

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
    slotMinutes,
    onChanged,
}: {
    pitches: SetupPitch[];
    slotMinutes: number;
    onChanged?: () => void;
}) {
    const [editing, setEditing] = useState<SetupPitch | "new" | null>(null);
    const [deleting, setDeleting] = useState<SetupPitch | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    async function confirmDelete() {
        if (!deleting) return;
        setDeleteBusy(true);
        setDeleteError(null);
        try {
            await api(`/api/admin/pitches/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
            setDeleting(null);
            onChanged?.();
        } catch (e) {
            setDeleteError(e instanceof ApiError ? e.message : "Could not delete. Please try again.");
        } finally {
            setDeleteBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-xl font-bold">Fields</h2>
                    <p className="text-sm text-evergreen/70">Each sports field/court the venue offers.</p>
                </div>
                <Button onClick={() => setEditing("new")}>
                    <Plus size={18} aria-hidden /> Add field
                </Button>
            </div>

            {pitches.length === 0 ? (
                <Card><p className="text-sm text-evergreen/70">No fields yet. Click “Add field” to create one.</p></Card>
            ) : (
                <ul className="grid gap-4 md:grid-cols-2">
                    {pitches.map((p) => (
                        <li key={p.id}>
                            <Card className="space-y-3">
                                {p.image && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={p.image}
                                        alt={`${p.name} — ${p.sport}`}
                                        className="aspect-video w-full rounded-xl object-cover"
                                        loading="lazy"
                                    />
                                )}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h4 className="text-lg font-bold">{p.name}</h4>
                                        <p className="mt-0.5 text-sm text-evergreen/80">
                                            {p.sport} · {p.format} · {formatTime12(p.openTime)}–{formatTime12(p.closeTime)}
                                        </p>
                                    </div>
                                    <Badge tone={p.status === "ACTIVE" ? "success" : "maint"}>
                                        {p.status === "ACTIVE" ? "Active" : "Disabled"}
                                    </Badge>
                                </div>
                                <p className="text-sm text-evergreen/80">
                                    {p.upcomingBookings} upcoming {p.upcomingBookings === 1 ? "booking" : "bookings"}
                                </p>
                                <div className="flex flex-wrap gap-2 border-t border-evergreen/10 pt-3">
                                    <Button variant="outline" onClick={() => setEditing(p)}>
                                        <Pencil size={16} aria-hidden /> Edit
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="text-booked"
                                        onClick={() => {
                                            setDeleteError(null);
                                            setDeleting(p);
                                        }}
                                        disabled={p.upcomingBookings > 0}
                                        title={p.upcomingBookings > 0 ? "Disable the field instead — it has upcoming bookings" : "Delete this field"}
                                    >
                                        <Trash2 size={16} aria-hidden /> Delete
                                    </Button>
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <SideSheet
                open={!!editing}
                onClose={() => setEditing(null)}
                title={editing === "new" ? "Add field" : "Edit field"}
                description={editing === "new" ? "Create a new sports field or court." : "Update this field's details, schedule and status."}
                icon={FileEdit}
            >
                {editing && (
                    <PitchForm
                        key={editing === "new" ? "new" : editing.id}
                        pitch={editing === "new" ? null : editing}
                        slotMinutes={slotMinutes}
                        onDone={() => {
                            setEditing(null);
                            onChanged?.();
                        }}
                    />
                )}
            </SideSheet>

            <SideSheet
                open={!!deleting}
                onClose={() => setDeleting(null)}
                title="Delete field"
                description="This cannot be undone."
                icon={Trash2}
            >
                {deleting && (
                    <div className="space-y-4">
                        <p className="text-sm">
                            Delete <strong>{deleting.name}</strong> ({deleting.sport})?
                        </p>
                        <p className="text-sm text-evergreen/80">
                            The field is removed from the database and its Cloudinary image is deleted.
                            Existing bookings stay valid; only new bookings are affected.
                        </p>
                        {deleteError && (
                            <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                                {deleteError}
                            </p>
                        )}
                        <div className="flex gap-2">
                            <Button variant="danger" className="flex-1" disabled={deleteBusy} onClick={confirmDelete}>
                                {deleteBusy ? "Deleting…" : "Delete field"}
                            </Button>
                            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteBusy}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </SideSheet>
        </div>
    );
}

function PitchForm({
    pitch,
    slotMinutes,
    onDone,
}: {
    pitch: SetupPitch | null;
    slotMinutes: number;
    onDone: () => void;
}) {
    const isNew = !pitch;
    const VENUE_ID = venue.id;
    const VENUE_SPORTS = venue.sports;
    const [f, setF] = useState<FormState>({
        branchId: pitch?.branchId ?? VENUE_ID,
        name: pitch?.name ?? "",
        sport: pitch?.sport ?? VENUE_SPORTS[0] ?? "",
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

    const sports = [...new Set([...VENUE_SPORTS, ...(pitch ? [pitch.sport] : [])])];
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
            "/admin/setup/pitches",
            isNew ? "POST" : "PATCH",
            onDone
        );
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-6" aria-label={isNew ? "Add field" : "Edit field"}>
            <SheetSection icon={FileEdit} title="Basics" description="What this field is called and what sport it hosts.">
                <Input
                    label="Field name"
                    value={f.name}
                    placeholder="e.g. Field A, Cricket Net"
                    error={fields.name}
                    onChange={(e) => set("name", e.target.value)}
                />
                <Select
                    label="Sport"
                    value={f.sport}
                    error={fields.sport}
                    hint={sports.length === 0 ? "Add sports in the Venue tab first." : undefined}
                    onChange={(e) => set("sport", e.target.value)}
                >
                    {sports.length === 0 && <option value="">No sports yet</option>}
                    {sports.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </Select>
                {/* Format — quick-select chips + free text. Shows "5 vs 5" style so clients understand. */}
                <div className="space-y-2">
                    <Input
                        label="Format (team size / playing style)"
                        value={f.format}
                        placeholder="e.g. 5 vs 5, 6 vs 6, 7 vs 7"
                        error={fields.format}
                        onChange={(e) => set("format", e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        <p className="w-full text-xs text-evergreen/60">Quick pick:</p>
                        {FORMAT_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                aria-pressed={f.format === preset}
                                onClick={() => set("format", preset)}
                                className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${f.format === preset
                                    ? "border-teal bg-teal text-white"
                                    : "border-evergreen/15 bg-surface text-evergreen hover:border-teal hover:bg-mint/40"
                                    }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                </div>
            </SheetSection>

            <SheetSection icon={Ruler} title="Field details" description="Physical attributes and amenities. Only enter a size the owner has measured.">
                <Input
                    label="Dimensions (verified size)"
                    value={f.dimensions}
                    placeholder="e.g. 40m × 20m"
                    error={fields.dimensions}
                    onChange={(e) => set("dimensions", e.target.value)}
                />
                <div className="space-y-2">
                    <Input
                        label="Surface"
                        value={f.surface}
                        placeholder="e.g. Artificial turf, Turf wicket"
                        error={fields.surface}
                        onChange={(e) => set("surface", e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        <p className="w-full text-xs text-evergreen/60">Quick pick:</p>
                        {SURFACE_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                aria-pressed={f.surface === preset}
                                onClick={() => set("surface", preset)}
                                className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${f.surface === preset
                                    ? "border-teal bg-teal text-white"
                                    : "border-evergreen/15 bg-surface text-evergreen hover:border-teal hover:bg-mint/40"
                                    }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2">
                    <ListInput
                        label="Facilities (comma-separated)"
                        value={f.facilities}
                        placeholder="e.g. Floodlights, Parking, Washroom"
                        hint="List what the field actually has."
                        error={fields.facilities}
                        onChange={(v) => set("facilities", v)}
                    />
                    <div className="flex flex-wrap gap-2">
                        <p className="w-full text-xs text-evergreen/60">Quick pick (tap to toggle):</p>
                        {FACILITY_PRESETS.map((preset) => {
                            const active = f.facilities.includes(preset);
                            return (
                                <button
                                    key={preset}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                        set(
                                            "facilities",
                                            active
                                                ? f.facilities.filter((x) => x !== preset)
                                                : [...f.facilities, preset]
                                        )
                                    }
                                    className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${active
                                            ? "border-teal bg-teal text-white"
                                            : "border-evergreen/15 bg-surface text-evergreen hover:border-teal hover:bg-mint/40"
                                        }`}
                                >
                                    {preset}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <ImageUpload
                    label="Field photo (optional)"
                    value={f.image}
                    onChange={(url) => set("image", url)}
                    folder="kaziturf/pitches"
                    publicIdPrefix={`pitch-${f.branchId ?? "x"}`}
                    hint="JPEG, PNG, WebP or AVIF. Stored on Cloudinary. The old image is deleted when you replace it or remove the field."
                    error={fields.image}
                />
            </SheetSection>

            <SheetSection icon={Clock} title="Schedule" description="Operating hours and how many slots a customer can book at once.">
                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Opens"
                        type="time"
                        value={f.openTime}
                        error={fields.openTime}
                        onChange={(e) => e.target.value && setOpen(e.target.value)}
                    />
                    <Select
                        label="Closes"
                        value={f.closeTime}
                        error={fields.closeTime}
                        onChange={(e) => set("closeTime", e.target.value)}
                    >
                        {closes.map((c) => (
                            <option key={c} value={c}>{formatTime12(c)}</option>
                        ))}
                    </Select>
                </div>
                <p className="-mt-2 text-xs text-evergreen/70">
                    {slotCount} slots of {slotMinutes} minutes. Closing times are limited to whole slots.
                </p>
                <Select
                    label="Max slots per booking (how many a customer can book together)"
                    value={String(f.maxConsecutiveSlots)}
                    error={fields.maxConsecutiveSlots}
                    onChange={(e) => set("maxConsecutiveSlots", Number(e.target.value))}
                >
                    {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </Select>
            </SheetSection>

            <SheetSection icon={ToggleLeft} title="Status" description="Disabled blocks new bookings but keeps existing ones visible.">
                <Select
                    label="Status"
                    value={f.status}
                    error={fields.status}
                    hint={
                        pitch && pitch.upcomingBookings > 0 && f.status === "DISABLED"
                            ? `${pitch.upcomingBookings} upcoming bookings stay valid. Only new bookings are blocked.`
                            : "Disabled blocks new bookings but keeps existing ones visible."
                    }
                    onChange={(e) => set("status", e.target.value as SetupPitch["status"])}
                >
                    <option value="ACTIVE">Active (taking bookings)</option>
                    <option value="DISABLED">Disabled</option>
                </Select>
            </SheetSection>

            <FormActions busy={busy} error={error} label={isNew ? "Add field" : "Save changes"} onCancel={onDone} />
        </form>
    );
}