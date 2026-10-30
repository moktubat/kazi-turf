"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarSearch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ApiError, api, isAbort } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { toggleCell } from "@/lib/selection";
import type { Cell } from "@/server/availability";
import type { Quote } from "@/server/pricing";
import type { AvailabilityResponse, BookingDto } from "@/types/booking";
import { ConfirmStep, type FlowUser } from "./ConfirmStep";
import { FilterBar, type FlowBranch } from "./FilterBar";
import { SlotGrid } from "./SlotGrid";
import { Stepper } from "./Stepper";
import { SummaryBar } from "./SummaryBar";
import { SummaryCard, type Amounts, type SelectionInfo } from "./SummaryCard";

export interface FlowInitial {
    branchId: string;
    sport: string;
    date: string;
    pitchId?: string;
    slot?: string; // "19:30" Dhaka
    restore: boolean; // no URL filters: use remembered branch/sport
}

interface Sel {
    pitchId: string | null;
    cellStarts: string[];
}

type QuoteState = { status: "idle" | "loading" | "ready" | "error"; quote?: Quote; error?: string };

const STORE_KEY = "kt:finder"; // same key as the Home finder
const REFRESH_MS = 30_000;

export function BookingFlow({
    branches,
    initial,
    minDate,
    maxDate,
    user,
    policy,
}: {
    branches: FlowBranch[];
    initial: FlowInitial;
    minDate: string;
    maxDate: string;
    user: FlowUser | null;
    policy: { advancePercent: number; holdMinutes: number; slotMinutes: number };
}) {
    const router = useRouter();

    const [branchId, setBranchId] = useState(initial.branchId);
    const [sport, setSport] = useState(initial.sport);
    const [date, setDate] = useState(initial.date);

    const [data, setData] = useState<AvailabilityResponse | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [loadError, setLoadError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const [sel, setSel] = useState<Sel>({ pitchId: null, cellStarts: [] });
    const [quoteState, setQuoteState] = useState<QuoteState>({ status: "idle" });
    const [step, setStep] = useState<1 | 2>(1);
    const [hold, setHold] = useState<BookingDto | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const preselected = useRef(false);

    const branch = branches.find((b) => b.id === branchId) ?? branches[0];

    /* ---------- availability ---------- */
    const load = useCallback(
        async (silent = false) => {
            abortRef.current?.abort();
            const ctrl = new AbortController();
            abortRef.current = ctrl;
            if (silent) setRefreshing(true);
            else setStatus("loading");

            try {
                const qs = new URLSearchParams({ branch: branchId, sport, date });
                const res = await api<AvailabilityResponse>(`/api/availability?${qs}`, { signal: ctrl.signal });
                setData(res);
                setStatus("ready");
            } catch (e) {
                if (isAbort(e)) return;
                setLoadError(e instanceof ApiError ? e.message : "Could not load slots.");
                // Keep showing the last good data on a silent refresh failure.
                if (!silent) setStatus("error");
            } finally {
                if (abortRef.current === ctrl) setRefreshing(false);
            }
        },
        [branchId, sport, date]
    );

    useEffect(() => {
        load();
        return () => abortRef.current?.abort();
    }, [load]);

    // Optional 30s auto-refresh, only while the tab is visible and on Step 1.
    useEffect(() => {
        if (step !== 1) return;
        const id = setInterval(() => {
            if (document.visibilityState === "visible") load(true);
        }, REFRESH_MS);
        return () => clearInterval(id);
    }, [step, load]);

    /* ---------- remembered context ---------- */
    useEffect(() => {
        if (!initial.restore) return;
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
            const b = branches.find((x) => x.id === saved?.branch);
            if (b) {
                setBranchId(b.id);
                setSport(b.sports.includes(saved.sport) ? saved.sport : b.sports[0]);
            }
        } catch {
            /* storage unavailable */
        }
        // run once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function remember(b: string, s: string) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({ branch: b, sport: s }));
        } catch {
            /* ignore */
        }
    }

    /* ---------- filter handlers (reset selection, never lose filters on errors) ---------- */
    function resetSelection() {
        preselected.current = true;
        setSel({ pitchId: null, cellStarts: [] });
        setNotice(null);
    }

    function changeBranch(id: string) {
        const b = branches.find((x) => x.id === id);
        if (!b) return;
        const nextSport = b.sports.includes(sport) ? sport : b.sports[0];
        setBranchId(id);
        setSport(nextSport);
        setData(null);
        resetSelection();
        remember(id, nextSport);
    }

    function changeSport(s: string) {
        setSport(s);
        setData(null);
        resetSelection();
        remember(branchId, s);
    }

    function changeDate(d: string) {
        setDate(d);
        setData(null);
        resetSelection();
    }

    /* ---------- deep-link preselect ---------- */
    useEffect(() => {
        if (!data || preselected.current || !initial.pitchId || !initial.slot) return;
        preselected.current = true;
        const p = data.pitches.find((x) => x.id === initial.pitchId);
        const cell = p?.cells.find((c) => c.start === initial.slot && c.status === "AVAILABLE");
        if (p && cell) setSel({ pitchId: p.id, cellStarts: [cell.cellStart] });
    }, [data, initial.pitchId, initial.slot]);

    /* ---------- drop slots that were taken in the meantime ---------- */
    useEffect(() => {
        if (!data || step !== 1 || !sel.pitchId || sel.cellStarts.length === 0) return;
        const p = data.pitches.find((x) => x.id === sel.pitchId);
        const stillOpen = p
            ? sel.cellStarts.filter((s) => p.cells.find((c) => c.cellStart === s)?.status === "AVAILABLE")
            : [];
        if (stillOpen.length !== sel.cellStarts.length) {
            setSel({ pitchId: stillOpen.length ? sel.pitchId : null, cellStarts: stillOpen });
            setNotice("A slot you picked was just taken. Your filters are kept. Pick another time.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    /* ---------- live server quote ---------- */
    useEffect(() => {
        if (!sel.pitchId || sel.cellStarts.length === 0) {
            setQuoteState({ status: "idle" });
            return;
        }
        setQuoteState((s) => ({ status: "loading", quote: s.quote }));
        const ctrl = new AbortController();
        const t = setTimeout(async () => {
            try {
                const r = await api<{ quote: Quote }>("/api/quote", {
                    method: "POST",
                    signal: ctrl.signal,
                    body: JSON.stringify({ pitchId: sel.pitchId, cellStarts: sel.cellStarts }),
                });
                setQuoteState({ status: "ready", quote: r.quote });
            } catch (e) {
                if (isAbort(e)) return;
                if (e instanceof ApiError && e.code === "SLOT_UNAVAILABLE") {
                    setNotice(e.message);
                    load(true);
                }
                setQuoteState({ status: "error", error: e instanceof ApiError ? e.message : "Could not price this slot." });
            }
        }, 150);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [sel, load]);

    /* ---------- derived ---------- */
    const info: SelectionInfo | null = useMemo(() => {
        if (!data || !sel.pitchId || sel.cellStarts.length === 0) return null;
        const p = data.pitches.find((x) => x.id === sel.pitchId);
        if (!p) return null;
        const cells = sel.cellStarts
            .map((s) => p.cells.find((c) => c.cellStart === s))
            .filter((c): c is Cell => !!c)
            .sort((a, b) => a.cellStart.localeCompare(b.cellStart));
        if (cells.length === 0) return null;
        return {
            branchName: branch.name,
            pitchName: p.name,
            sport: p.sport,
            date,
            start: cells[0].start,
            end: cells[cells.length - 1].end,
            slotCount: cells.length,
            minutes: cells.length * policy.slotMinutes,
        };
    }, [data, sel, branch.name, date, policy.slotMinutes]);

    // After the hold exists, show the server's saved amounts, not the preview.
    const amounts: Amounts | null = hold
        ? {
            subtotal: hold.subtotal,
            vat: hold.vatAmount,
            vatRate: hold.vatRatePercent,
            total: hold.total,
            advance: hold.advanceAmount,
            balance: hold.balanceAmount,
        }
        : quoteState.quote
            ? {
                subtotal: quoteState.quote.subtotal,
                vat: quoteState.quote.vat,
                vatRate: quoteState.quote.vatRatePercent,
                total: quoteState.quote.total,
                advance: quoteState.quote.advance,
                balance: quoteState.quote.balance,
            }
            : null;

    const quoteLoading = quoteState.status === "loading";
    const canContinue = !!info && !!amounts && !quoteLoading && quoteState.status !== "error";
    const hasOpen = data?.pitches.some((p) => p.cells.some((c) => c.status === "AVAILABLE")) ?? false;

    /* ---------- actions ---------- */
    function onToggle(pitchId: string, cell: Cell) {
        const pitch = data?.pitches.find((p) => p.id === pitchId);
        if (!pitch) return;
        setNotice(null);
        setSel((s) => {
            const current = s.pitchId === pitchId ? s.cellStarts : [];
            const next = toggleCell(current, pitch.cells, cell, pitch.maxConsecutiveSlots);
            return { pitchId: next.length ? pitchId : null, cellStarts: next };
        });
    }

    function goConfirm() {
        if (!canContinue) return;
        setStep(2);
        window.scrollTo({ top: 0 });
    }

    async function goBack() {
        if (hold) {
            try {
                await api(`/api/bookings/${encodeURIComponent(hold.code)}`, { method: "DELETE" });
            } catch {
                /* the hold expires on its own */
            }
            setHold(null);
        }
        setStep(1);
        load(true);
    }

    function taken(message: string) {
        setHold(null);
        setStep(1);
        setNotice(message);
        load();
    }

    function pickAgain() {
        setHold(null);
        setStep(1);
        resetSelection();
        setNotice("Your hold expired. Pick a slot again.");
        load();
    }

    /* ---------- render ---------- */
    return (
        <div className="mx-auto max-w-6xl px-4 py-6 pb-32 lg:pb-10">
            <Stepper step={step} />

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
                <div className="min-w-0 space-y-5">
                    {step === 1 && (
                        <>
                            <h1 className="text-2xl font-extrabold md:text-3xl">Choose your slot</h1>

                            <FilterBar
                                branches={branches}
                                branchId={branchId}
                                sport={sport}
                                date={date}
                                minDate={minDate}
                                maxDate={maxDate}
                                onBranch={changeBranch}
                                onSport={changeSport}
                                onDate={changeDate}
                            />

                            {notice && (
                                <p role="alert" className="flex items-start gap-2 rounded-xl bg-held-soft p-3 text-sm font-medium text-held">
                                    <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /> {notice}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-evergreen/80">
                                <p aria-live="polite">
                                    {data ? `Last updated ${formatTime(data.updatedAt)}` : "Loading slots…"}
                                </p>
                                <Button variant="ghost" onClick={() => load(true)} disabled={refreshing} aria-label="Refresh availability">
                                    <RefreshCw size={16} aria-hidden className={refreshing ? "animate-spin" : ""} /> Refresh
                                </Button>
                            </div>

                            {status === "loading" && !data && <SlotSkeleton />}

                            {status === "error" && !data && (
                                <Card className="space-y-3" role="alert">
                                    <p className="font-semibold">{loadError}</p>
                                    <Button onClick={() => load()}>Try again</Button>
                                </Card>
                            )}

                            {data && data.pitches.length === 0 && (
                                <Card>
                                    <p className="font-semibold">No pitches for this sport at {branch.name} yet.</p>
                                </Card>
                            )}

                            {data && data.pitches.length > 0 && (
                                <>
                                    {!hasOpen && (
                                        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="font-semibold">No slots on this date.</p>
                                            {data.nextAvailableDate ? (
                                                <Button variant="outline" onClick={() => changeDate(data.nextAvailableDate!)}>
                                                    <CalendarSearch size={18} aria-hidden /> Next available
                                                </Button>
                                            ) : (
                                                <p className="text-sm text-evergreen/70">Nothing open in the booking window.</p>
                                            )}
                                        </Card>
                                    )}
                                    <SlotGrid
                                        pitches={data.pitches}
                                        selectedPitchId={sel.pitchId}
                                        selected={sel.cellStarts}
                                        preferPitchId={initial.pitchId}
                                        onToggle={onToggle}
                                    />
                                </>
                            )}
                        </>
                    )}

                    {step === 2 && info && sel.pitchId && (
                        <ConfirmStep
                            info={info}
                            amounts={amounts}
                            loading={quoteLoading}
                            advancePercent={policy.advancePercent}
                            user={user}
                            selection={{ pitchId: sel.pitchId, cellStarts: sel.cellStarts }}
                            hold={hold}
                            onBack={goBack}
                            onHeld={setHold}
                            onTaken={taken}
                            onPickAgain={pickAgain}
                            onAuthed={() => router.refresh()}
                        />
                    )}
                </div>

                {/* Desktop: sticky summary */}
                <aside className="hidden lg:block">
                    <div className="sticky top-20 space-y-3">
                        <SummaryCard
                            info={info}
                            amounts={amounts}
                            loading={quoteLoading}
                            advancePercent={policy.advancePercent}
                            error={quoteState.error}
                        />
                        {step === 1 && (
                            <Button size="lg" className="w-full" disabled={!canContinue} onClick={goConfirm}>
                                Continue
                            </Button>
                        )}
                    </div>
                </aside>
            </div>

            {/* Phone: sticky summary bar for Step 1 (Step 2 renders its own action bar) */}
            {step === 1 && (
                <SummaryBar
                    total={amounts?.total ?? null}
                    detail={
                        info
                            ? `${info.pitchName} · ${info.start}–${info.end}${amounts ? ` · ${policy.advancePercent}% advance` : ""}`
                            : "Pick a slot to continue"
                    }
                    disabled={!canContinue}
                    onContinue={goConfirm}
                />
            )}
        </div>
    );
}

function SlotSkeleton() {
    return (
        <div aria-busy aria-label="Loading slots" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-[4.5rem] animate-pulse rounded-xl bg-evergreen/10" />
            ))}
        </div>
    );
}