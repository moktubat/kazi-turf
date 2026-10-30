"use client";
import { useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { ApiError, api } from "@/lib/api";
import { formatDateLong } from "@/lib/format";
import type { BoardCell } from "@/types/admin";

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
    const blocked = cell.status === "MAINTENANCE";
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(block: boolean) {
        if (block && reason.trim().length < 3) {
            setError("Add a reason (3+ characters).");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await api("/api/admin/blocks", {
                method: "POST",
                body: JSON.stringify({ pitchId, cellStart: cell.cellStart, block, reason: reason.trim() || undefined }),
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
                <div className="flex justify-between gap-4"><dt className="text-evergreen/80">Time</dt><dd className="font-semibold">{cell.start}–{cell.end}</dd></div>
            </dl>

            {blocked ? (
                <>
                    <p className="flex items-start gap-2 rounded-xl bg-maint-soft p-3 text-sm font-medium text-maint">
                        <Wrench size={18} aria-hidden className="mt-0.5 shrink-0" /> Blocked{cell.reason ? `: ${cell.reason}` : ""}
                    </p>
                    {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}
                    <Button size="lg" className="w-full" disabled={busy} onClick={() => submit(false)}>
                        {busy ? "Unblocking…" : "Unblock this slot"}
                    </Button>
                </>
            ) : (
                <>
                    <Input
                        label="Reason for blocking"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Turf repair"
                        maxLength={120}
                    />
                    {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}
                    <Button size="lg" className="w-full" disabled={busy} onClick={() => submit(true)}>
                        <Wrench size={18} aria-hidden /> {busy ? "Blocking…" : "Block for maintenance"}
                    </Button>
                </>
            )}
        </div>
    );
}