"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Banknote, ChevronLeft, ChevronRight, Inbox, LogIn, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { SideSheet } from "@/components/ui/SideSheet";
import { ApiError, api, isAbort } from "@/lib/api";
import { formatBDT, formatTime } from "@/lib/format";
import { addDays } from "@/lib/time";
import type { Role } from "@/types";
import type { BoardCell, BoardResponse } from "@/types/admin";
import { BookingPanel } from "./BookingPanel";
import { DeskBoard } from "./DeskBoard";
import { FindBooking } from "./FindBooking";
import { MaintenancePanel } from "./MaintenancePanel";
import { WalkInForm } from "./WalkInForm";

type Drawer =
    | { kind: "walkin"; pitchId: string; cellStart: string }
    | { kind: "block"; pitchId: string; cellStart: string }
    | { kind: "booking"; code: string };

const REFRESH_MS = 30_000;

function Stat({
    icon: Icon,
    label,
    value,
    href,
}: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    href?: string;
}) {
    const body = (
        <>
            <span className="flex items-center justify-between gap-2 text-sm text-evergreen/70">
                {label}
                <Icon size={16} aria-hidden className="text-evergreen/40" />
            </span>
            <span className="break-words font-heading text-2xl font-extrabold sm:text-3xl">{value}</span>
        </>
    );
    const cls = "flex flex-col gap-2 rounded-2xl border border-evergreen/10 bg-surface p-5 shadow-sm";
    return href ? (
        <Link href={href} className={`${cls} transition-colors hover:border-teal`}>
            {body}
        </Link>
    ) : (
        <div className={cls}>{body}</div>
    );
}

export function StaffDesk({
    venue,
    today,
    maxDate,
    role,
}: {
    venue: { id: string; name: string };
    today: string;
    maxDate: string;
    role: Role;
}) {
    const venueId = venue.id;
    const [date, setDate] = useState(today);
    // "book": tapping an open slot starts a walk-in. "manage": tapping a slot
    // opens Hold / Maintenance (no booking is created). ?manage=1 opens in manage mode.
    const searchParams = useSearchParams();
    const manageParam = searchParams.get("manage");
    const [mode, setMode] = useState<"book" | "manage">(manageParam === "1" ? "manage" : "book");

    // ?manage=1 can arrive while this component is already mounted (RatesTab's
    // "Desk → Manage slots" link, and the sidebar switching between /admin and
    // /admin?manage=1). useState reads its initializer only on the first mount,
    // so the desk used to stay in whatever mode opened first until a reload.
    // Follow the query param whenever it actually changes; the in-page Book /
    // Manage toggle still owns the mode between navigations (it doesn't touch
    // the URL, so its value never re-triggers this).
    const [lastManageParam, setLastManageParam] = useState<string | null>(manageParam);
    if (manageParam !== lastManageParam) {
        setLastManageParam(manageParam);
        setMode(manageParam === "1" ? "manage" : "book");
    }

    const [board, setBoard] = useState<BoardResponse | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [drawer, setDrawer] = useState<Drawer | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const minDate = addDays(today, -90);

    /** A finished board request: the board, an error message, or null when it was aborted. */
    type BoardResult = { ok: true; board: BoardResponse } | { ok: false; error: string } | null;

    // Starts a request and aborts the previous one, so an older board never replaces a newer one.
    const startRequest = useCallback((): { ctrl: AbortController; result: Promise<BoardResult> } => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const result = api<BoardResponse>(`/api/admin/board?${new URLSearchParams({ date })}`, { signal: ctrl.signal }).then(
            (board): BoardResult => ({ ok: true, board }),
            (e): BoardResult => (isAbort(e) ? null : { ok: false, error: e instanceof ApiError ? e.message : "Could not load the board." })
        );
        return { ctrl, result };
    }, [date]);

    // Applies a finished request (called from the request's own callback, never synchronously).
    const apply = useCallback((r: BoardResult, silent: boolean, ctrl: AbortController) => {
        if (r?.ok) {
            setBoard(r.board);
            setStatus("ready");
            setError(""); // a later success clears an earlier refresh failure
        } else if (r) {
            setError(r.error);
            if (!silent) setStatus("error");
        }
        if (abortRef.current === ctrl) setRefreshing(false);
    }, []);

    /** For buttons, timers and callbacks: show the spinner or skeleton, then fetch. */
    const load = useCallback(
        (silent = false) => {
            if (!venueId) return Promise.resolve();
            if (silent) setRefreshing(true);
            else setStatus("loading");
            const { ctrl, result } = startRequest();
            return result.then((r) => apply(r, silent, ctrl));
        },
        [venueId, startRequest, apply]
    );

    // First load and every date change. "loading" is already set: initially, and by changeDate.
    useEffect(() => {
        if (!venueId) return;
        const { ctrl, result } = startRequest();
        result.then((r) => apply(r, false, ctrl));
        return () => ctrl.abort();
    }, [venueId, startRequest, apply]);

    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState === "visible") load(true);
        }, REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);

    function changeDate(d: string) {
        if (d < minDate || d > maxDate || d === date) return; // same day: nothing to reload
        setBoard(null);
        setStatus("loading");
        setDate(d);
    }

    const pitch = drawer && drawer.kind !== "booking" ? board?.pitches.find((p) => p.id === drawer.pitchId) : undefined;
    const cell: BoardCell | undefined =
        drawer && drawer.kind !== "booking" ? pitch?.cells.find((c) => c.cellStart === drawer.cellStart) : undefined;

    const title =
        drawer?.kind === "walkin" ? "Walk-in booking" : drawer?.kind === "block" ? "Hold or maintenance" : "Booking";

    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Staff Desk</h1>

            <Card className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <Input
                    label="Date"
                    type="date"
                    value={date}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => e.target.value && changeDate(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" aria-label="Previous day" onClick={() => changeDate(addDays(date, -1))} disabled={date <= minDate}>
                        <ChevronLeft size={18} aria-hidden />
                    </Button>
                    <Button variant="outline" onClick={() => changeDate(today)} disabled={date === today}>Today</Button>
                    <Button variant="outline" aria-label="Next day" onClick={() => changeDate(addDays(date, 1))} disabled={date >= maxDate}>
                        <ChevronRight size={18} aria-hidden />
                    </Button>
                </div>
            </Card>

            <div role="group" className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Day summary">
                <Stat icon={Users} label="Arrivals pending" value={board?.stats.arrivalsPending ?? "–"} />
                <Stat icon={LogIn} label="Checked in" value={board?.stats.checkedIn ?? "–"} />
                <Stat icon={Banknote} label="Cash collected" value={board ? formatBDT(board.stats.cashCollected) : "–"} />
                <Stat
                    icon={Inbox}
                    label="Open requests"
                    value={board?.stats.openRequests ?? "–"}
                    href="/admin/bookings?request=open"
                />
            </div>

            <FindBooking onPick={(code) => setDrawer({ kind: "booking", code })} />

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-evergreen/80">
                <p aria-live="polite">{board ? `Last updated ${formatTime(board.updatedAt)}` : "Loading board…"}</p>
                {/* A failed background refresh keeps the last board on screen; say that it is out of date. */}
                {board && error && (
                    <p role="alert" className="w-full rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                        Could not refresh: {error} The board shows the last update. Tap Refresh to try again.
                    </p>
                )}
                <Button variant="ghost" onClick={() => load(true)} disabled={refreshing} aria-label="Refresh board">
                    <RefreshCw size={16} aria-hidden className={refreshing ? "animate-spin" : ""} /> Refresh
                </Button>
            </div>

            {status === "loading" && !board && (
                <div role="status" aria-busy aria-label="Loading board" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="h-[5.75rem] animate-pulse rounded-xl bg-evergreen/10" />
                    ))}
                </div>
            )}

            {status === "error" && !board && (
                <Card className="space-y-3" role="alert">
                    <p className="flex items-start gap-2 rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked"><AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /> {error}</p>
                    <Button onClick={() => load()}>Try again</Button>
                </Card>
            )}

            {board && board.pitches.length === 0 && (
                <Card><p className="text-sm text-evergreen/70">No active pitches today.</p></Card>
            )}

            {board && board.pitches.length > 0 && (
                <DeskBoard
                    pitches={board.pitches}
                    mode={mode}
                    onModeChange={setMode}
                    onAvailable={(pitchId, c) => setDrawer({ kind: "walkin", pitchId, cellStart: c.cellStart })}
                    onBlock={(pitchId, c) => setDrawer({ kind: "block", pitchId, cellStart: c.cellStart })}
                    onBooking={(code) => setDrawer({ kind: "booking", code })}
                />
            )}

            <SideSheet open={!!drawer} onClose={() => setDrawer(null)} title={title}>
                {drawer?.kind === "walkin" && pitch && board && (
                    <WalkInForm
                        pitch={pitch}
                        cellStart={drawer.cellStart}
                        date={date}
                        onCreated={() => load(true)}
                        onClose={() => setDrawer(null)}
                        onHoldInstead={() => setDrawer({ kind: "block", pitchId: drawer.pitchId, cellStart: drawer.cellStart })}
                    />
                )}
                {drawer?.kind === "block" && pitch && cell && (
                    <MaintenancePanel
                        pitchId={pitch.id}
                        pitchName={pitch.name}
                        cell={cell}
                        date={date}
                        onDone={() => {
                            setDrawer(null);
                            load(true);
                        }}
                    />
                )}
                {drawer?.kind === "booking" && <BookingPanel key={drawer.code} code={drawer.code} role={role} onChanged={() => load(true)} />}
            </SideSheet>
        </div>
    );
}