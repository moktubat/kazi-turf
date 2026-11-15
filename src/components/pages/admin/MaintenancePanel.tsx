"use client";
import { useState } from "react";
import { Timer, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { ApiError, api } from "@/lib/api";
import { formatDateLong, formatTime12 } from "@/lib/format";
import type { BoardCell } from "@/types/admin";

type BlockKind = "MAINTENANCE" | "HELD";

const KINDS: { id: BlockKind; label: string; hint: string; icon: React.ElementType }[] = [
    {
        id: "MAINTENANCE",
        label: "Maintenance",
        hint: "Turf repair, cleaning, net fixing…",
        icon: Wrench,
    },
    {
        id: "HELD",
        label: "Hold (walk-in)",
        hint: "Direct players, friends & family — they pay at the venue, the slot shows as Held online.",
        icon: Users,
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
    // A staff block is MAINTENANCE or a HELD claim without a booking; an online
    // hold has a booking attached and must not be editable here.
    const staffBlocked = cell.status === "MAINTENANCE" || (cell.status === "HELD" && !cell.booking);
    const blockedKind: BlockKind = cell.status === "MAINTENANCE" ? "MAINTENANCE" : "HELD";
    const [kind, setKind] = useState<BlockKind>(cell.status === "AVAILABLE" || cell.status === "PAST" ? "MAINTENANCE" : blockedKind);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit() {
        if (reason.trim().length < 3) {
            setError("Add a reason (3+ characters).");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await api("/api/admin/blocks", {
                method: "POST",
                body: JSON.stringify({ pitchId, cellStart: cell.cellStart, block: true, kind, reason: reason.trim() }),
            });
            onDone();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
            setBusy(false);
        }
    }

    async function release() {
        setBusy(true);
        setError(null);
        try {
            await api("/api/admin/blocks", {
                method: "POST",
                body: JSON.stringify({ pitchId, cellStart: cell.cellStart, block: false, kind: blockedKind }),
            });
            onDone();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Pitch</dt><dd className="font-semibold">{pitchName}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Date</dt><dd className="font-semibold">{formatDateLong(date)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Time</dt><dd className="font-semibold">{formatTime12(cell.start)}–{formatTime12(cell.end)}</dd></div>
            </dl>

            {staffBlocked ? (
                <>
                    <p
                        className={cn(
                            "flex items-start gap-2 rounded-xl p-3 text-sm font-medium",
                            blockedKind === "HELD" ? "bg-held-soft text-held" : "bg-maint-soft text-maint"
                        )}
                    >
                        {blockedKind === "HELD" ? <Timer size={18} aria-hidden className="mt-0.5 shrink-0" /> : <Wrench size={18} aria-hidden className="mt-0.5 shrink-0" />}
                        {blockedKind === "HELD" ? "Held" : "Blocked for maintenance"}
                        {cell.reason ? `: ${cell.reason}` : ""}
                    </p>
                    <p className="text-sm text-evergreen/80">
                        Customers cannot book this slot while it is {blockedKind === "HELD" ? "held" : "blocked"}.
                    </p>
                    {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}
                    <Button size="lg" className="w-full" disabled={busy} onClick={release}>
                        {busy ? "Releasing…" : blockedKind === "HELD" ? "Release this hold" : "Unblock this slot"}
                    </Button>
                </>
            ) : (
                <>
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold">Why is this slot not bookable?</legend>
                        {KINDS.map((k) => {
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
                        label="Reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={kind === "HELD" ? "e.g. Walk-in group, paying at venue" : "e.g. Turf repair"}
                        maxLength={120}
                    />
                    {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}
                    <Button size="lg" className="w-full" disabled={busy} onClick={submit}>
                        {kind === "HELD" ? (
                            <><Timer size={18} aria-hidden /> {busy ? "Holding…" : "Hold this slot"}</>
                        ) : (
                            <><Wrench size={18} aria-hidden /> {busy ? "Blocking…" : "Block for maintenance"}</>
                        )}
                    </Button>
                </>
            )}
        </div>
    );
}