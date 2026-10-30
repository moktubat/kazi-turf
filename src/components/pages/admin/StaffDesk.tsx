"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, ChevronLeft, ChevronRight, Inbox, LogIn, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
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

const STORE_KEY = "kt:desk";
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
            <Icon size={18} aria-hidden className="text-teal" />
            <span className="text-xs font-semibold uppercase tracking-wide text-evergreen/70">{label}</span>
            <span className="font-heading text-xl font-extrabold">{value}</span>
        </>
    );
    const cls = "flex flex-col gap-1 rounded-2xl border border-evergreen/10 bg-white p-3";
    return href ? (
        <Link href={href} className={`${cls} hover:border-teal`}>
            {body}
        </Link>
    ) : (
        <div className={cls}>{body}</div>
    );
}

export function StaffDesk({
    branches,
    today,
    maxDate,
    role,
}: {
    branches: { id: string; name: string }[];
    today: string;
    maxDate: string;
    role: Role;
}) {
    const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
    const [date, setDate] = useState(today);
    const [board, setBoard] = useState<BoardResponse | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [drawer, setDrawer] = useState<Drawer | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const minDate = addDays(today, -90);

    // Remember the last branch.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORE_KEY);
            if (saved && branches.some((b) => b.id === saved)) setBranchId(saved);
        } catch {
            /* storage unavailable */
        }
        // run once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = useCallback(
        async (silent = false) => {
            if (!branchId) return;
            abortRef.current?.abort();
            const ctrl = new AbortController();
            abortRef.current = ctrl;
            if (silent) setRefreshing(true);
            else setStatus("loading");
            try {
                const r = await api<BoardResponse>(
                    `/api/admin/board?${new URLSearchParams({ branch: branchId, date })}`,
                    { signal: ctrl.signal }
                );
                setBoard(r);
                setStatus("ready");
            } catch (e) {
                if (isAbort(e)) return;
                setError(e instanceof ApiError ? e.message : "Could not load the board.");
                if (!silent) setStatus("error");
            } finally {
                if (abortRef.current === ctrl) setRefreshing(false);
            }
        },
        [branchId, date]
    );

    useEffect(() => {
        load();
        return () => abortRef.current?.abort();
    }, [load]);

    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState === "visible") load(true);
        }, REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);

    function changeBranch(id: string) {
        setBoard(null);
        setBranchId(id);
        try {
            localStorage.setItem(STORE_KEY, id);
        } catch {
            /* ignore */
        }
    }

    function changeDate(d: string) {
        if (d < minDate || d > maxDate) return;
        setBoard(null);
        setDate(d);
    }

    const pitch = drawer && drawer.kind !== "booking" ? board?.pitches.find((p) => p.id === drawer.pitchId) : undefined;
    const cell: BoardCell | undefined =
        drawer && drawer.kind !== "booking" ? pitch?.cells.find((c) => c.cellStart === drawer.cellStart) : undefined;

    const title =
        drawer?.kind === "walkin" ? "Walk-in booking" : drawer?.kind === "block" ? "Maintenance" : "Booking";

    return (
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Staff Desk</h1>

            <Card className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div className="grid gap-4 sm:grid-cols-2">
                    {branches.length > 1 ? (
                        <Select label="Branch" value={branchId} onChange={(e) => changeBranch(e.target.value)}>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </Select>
                    ) : (
                        <div>
                            <p className="text-sm font-semibold">Branch</p>
                            <p className="flex min-h-11 items-center font-heading font-bold">{branches[0]?.name}</p>
                        </div>
                    )}
                    <Input
                        label="Date"
                        type="date"
                        value={date}
                        min={minDate}
                        max={maxDate}
                        onChange={(e) => e.target.value && changeDate(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" aria-label="Previous day" onClick={() => changeDate(addDays(date, -1))} disabled={date <= minDate}>
                        <ChevronLeft size={18} aria-hidden />
                    </Button>
                    <Button variant="outline" onClick={() => changeDate(today)} disabled={date === today}>Today</Button>
                    <Button variant="outline" aria-label="Next day" onClick={() => changeDate(addDays(date, 1))} disabled={date >= maxDate}>
                        <ChevronRight size={18} aria-hidden />
                    </Button>
                </div>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Day summary">
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
                <Button variant="ghost" onClick={() => load(true)} disabled={refreshing} aria-label="Refresh board">
                    <RefreshCw size={16} aria-hidden className={refreshing ? "animate-spin" : ""} /> Refresh
                </Button>
            </div>

            {status === "loading" && !board && (
                <div aria-busy aria-label="Loading board" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="h-[5.75rem] animate-pulse rounded-xl bg-evergreen/10" />
                    ))}
                </div>
            )}

            {status === "error" && !board && (
                <Card className="space-y-3" role="alert">
                    <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} aria-hidden /> {error}</p>
                    <Button onClick={() => load()}>Try again</Button>
                </Card>
            )}

            {board && board.pitches.length === 0 && (
                <Card><p className="font-semibold">No active pitches at {board.branchName}.</p></Card>
            )}

            {board && board.pitches.length > 0 && (
                <DeskBoard
                    pitches={board.pitches}
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
                        branchName={board.branchName}
                        onCreated={() => load(true)}
                        onClose={() => setDrawer(null)}
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
                {drawer?.kind === "booking" && <BookingPanel code={drawer.code} role={role} onChanged={() => load(true)} />}
            </SideSheet>
        </div>
    );
}