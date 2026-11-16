"use client";
import { useState } from "react";
import { CircleCheck, Timer, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { ApiError, api } from "@/lib/api";
import { formatDateLong, formatTime12 } from "@/lib/format";
import type { BoardCell } from "@/types/admin";

type BlockKind = "MAINTENANCE" | "HELD";

const KINDS: { id: BlockKind; label: string; hint: string; icon: React.ElementType; placeholder: string }[] = [
    {
        id: "HELD",
        label: "Hold this slot",
        hint: "Keep it for someone who will pay at the venue (walk-in group, friends & family). No booking is created; it shows as Held online.",
        icon: Users,
        placeholder: "e.g. Rahim's group, paying at venue",
    },
    {
        id: "MAINTENANCE",
        label: "Maintenance",
        hint: "The pitch cannot be used: turf repair, cleaning, net or light fixing…",
        icon: Wrench,
        placeholder: "e.g. Turf repair",
    },
];

export function MaintenancePanel({
    pitchId,
    pitchName,
    cell,
    date,
    onDone,
}: {
    pitchId: string;
    pitchName: string;
    cell: BoardCell;
    date: string;
    onDone: () => void;
}) {
    // A staff block is MAINTENANCE or a HELD claim without a booking; a customer's
    // online hold has a booking attached and is never editable here.
    const staffBlocked = cell.status === "MAINTENANCE" || (cell.status === "HELD" && !cell.booking);
    const blockedKind: BlockKind = cell.status === "MAINTENANCE" ? "MAINTENANCE" : "HELD";
    const otherKind: BlockKind = blockedKind === "HELD" ? "MAINTENANCE" : "HELD";
    const [switching, setSwitching] = useState(false);
    const [kind, setKind] = useState<BlockKind>(staffBlocked ? otherKind : "HELD");
    const [reason, setReason] = useState(staffBlocked ? cell.reason ?? "" : "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function call(body: Record<string, unknown>) {
        setBusy(true);
        setError(null);
        try {
            await api("/api/admin/blocks", { method: "POST", body: JSON.stringify({ pitchId, cellStart: cell.cellStart, ...body }) });
            onDone();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
            setBusy(false);
        }
    }

    function submit() {
        if (reason.trim().length < 3) {
            setError("Add a short note (3+ characters) so the team knows why.");
            return;
        }
        void call({ block: true, kind, reason: reason.trim() });
    }

    const statusBox = staffBlocked ? (
        <p className={cn("flex items-start gap-2 rounded-xl p-3 text-sm font-semibold", blockedKind === "HELD" ? "bg-held-soft text-held" : "bg-maint-soft text-maint")}>
            {blockedKind === "HELD" ? <Timer size={18} aria-hidden className="mt-0.5 shrink-0" /> : <Wrench size={18} aria-hidden className="mt-0.5 shrink-0" />}
            <span>
                Now: {blockedKind === "HELD" ? "Held by staff" : "Maintenance"}
                {cell.reason ? <span className="block font-normal">{cell.reason}</span> : null}
            </span>
        </p>
    ) : (
        <p className="flex items-center gap-2 rounded-xl bg-emerald/15 p-3 text-sm font-semibold text-evergreen">
            <CircleCheck size={18} aria-hidden /> Now: Available, customers can book it
        </p>
    );

    const ended = cell.status === "PAST";

    return (
        <div className="space-y-4">
            <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Field</dt><dd className="font-semibold">{pitchName}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Date</dt><dd className="font-semibold">{formatDateLong(date)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Time</dt><dd className="font-semibold">{formatTime12(cell.start)}–{formatTime12(cell.end)}</dd></div>
            </dl>

            {statusBox}

            {ended ? (
                <p className="text-sm text-evergreen/80">This slot has already ended, so it cannot be held or blocked.</p>
            ) : staffBlocked && !switching ? (
                <>
                    <p className="text-sm text-evergreen/80">
                        Customers cannot book this slot until you {blockedKind === "HELD" ? "release the hold" : "remove maintenance"}.
                    </p>
                    {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}
                    <Button size="lg" className="w-full" disabled={busy} onClick={() => call({ block: false, kind: blockedKind })}>
                        {busy ? "Saving…" : blockedKind === "HELD" ? "Release hold (make available)" : "Remove maintenance (make available)"}
                    </Button>
                    <Button variant="outline" className="w-full" disabled={busy} onClick={() => setSwitching(true)}>
                        {otherKind === "HELD" ? <Users size={16} aria-hidden /> : <Wrench size={16} aria-hidden />}
                        Change to {otherKind === "HELD" ? "a staff hold" : "maintenance"}
                    </Button>
                </>
            ) : (
                <>
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold">{switching ? "Change to:" : "What do you want to do?"}</legend>
                        {KINDS.filter((k) => !switching || k.id === otherKind).map((k) => {
                            const active = kind === k.id;
                            const Icon = k.icon;
                            return (
                                <button
                                    key={k.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setKind(k.id)}
                                    className={cn(
                                        "flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors",
                                        active ? "border-teal bg-mint/60" : "border-evergreen/15 bg-surface hover:border-teal"
                                    )}
                                >
                                    <Icon size={18} aria-hidden className={active ? "mt-0.5 text-teal" : "mt-0.5 text-evergreen/60"} />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-bold">{k.label}</span>
                                        <span className="block text-xs text-evergreen/70">{k.hint}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </fieldset>

                    <Input
                        label="Note (who or why)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={KINDS.find((k) => k.id === kind)?.placeholder}
                        hint="Shown to staff on the board only, never to customers."
                        maxLength={120}
                    />
                    {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}
                    <Button size="lg" className="w-full" disabled={busy} onClick={submit}>
                        {kind === "HELD" ? <Timer size={18} aria-hidden /> : <Wrench size={18} aria-hidden />}
                        {busy ? "Saving…" : kind === "HELD" ? "Hold this slot" : "Mark as maintenance"}
                    </Button>
                    {switching && (
                        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setSwitching(false)}>
                            Back
                        </Button>
                    )}
                </>
            )}
        </div>
    );
}
