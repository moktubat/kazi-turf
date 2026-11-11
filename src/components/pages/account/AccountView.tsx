"use client";
import { useMemo, useState } from "react";
import { CalendarCheck, CalendarX2, History as HistoryIcon, RotateCcw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SideSheet } from "@/components/ui/SideSheet";
import type { AccountBookingDto, ChangeRequestInfo } from "@/types/account";
import { BookingRow } from "./BookingRow";
import { BookingSheet } from "./BookingSheet";
import { NextBookingCard } from "./NextBookingCard";
import { ProfileForms } from "./ProfileForms";

interface BookingGroup {
    id: string;
    label: string;
    items: AccountBookingDto[];
}

function groupUpcoming(upcoming: AccountBookingDto[], today: string): BookingGroup[] {
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const weekEndMs = todayMs + 7 * 86_400_000;

    const groups: BookingGroup[] = [
        { id: "today", label: "Today", items: [] },
        { id: "week", label: "This week", items: [] },
        { id: "later", label: "Later", items: [] },
    ];

    for (const b of upcoming) {
        const d = Date.parse(`${b.date}T00:00:00Z`);
        if (d < todayMs + 86_400_000) groups[0].items.push(b);
        else if (d < weekEndMs) groups[1].items.push(b);
        else groups[2].items.push(b);
    }

    return groups.filter((g) => g.items.length > 0);
}

type AccountTab = "upcoming" | "history" | "refund" | "profile";

export function AccountView({
    profile,
    upcoming,
    history,
    refunds,
    refundPolicy,
    initialCode,
    showBookings,
}: {
    profile: { name: string; phone: string; email: string };
    upcoming: AccountBookingDto[];
    history: AccountBookingDto[];
    refunds: AccountBookingDto[];
    refundPolicy: { tiers: { when: string; outcome: string }[]; method: string; timing: string; exceptions: string[] };
    initialCode: string | null;
    showBookings: boolean;
}) {

    const all = useMemo(() => [...upcoming, ...history, ...refunds], [upcoming, history, refunds]);
    const inHistory = !!initialCode && (history.some((b) => b.code === initialCode) || refunds.some((b) => b.code === initialCode));

    const [tab, setTab] = useState<AccountTab>(
        showBookings ? (inHistory ? "history" : "upcoming") : "profile"
    );
    const [openCode, setOpenCode] = useState<string | null>(
        initialCode && all.some((b) => b.code === initialCode) ? initialCode : null
    );
    const [requests, setRequests] = useState<Record<string, ChangeRequestInfo>>({});

    const merge = (b: AccountBookingDto): AccountBookingDto =>
        requests[b.code] ? { ...b, changeRequest: requests[b.code], canRequestChange: false } : b;

    const selected = openCode ? all.map(merge).find((b) => b.code === openCode) : undefined;

    function open(code: string) {
        setOpenCode(code);
        window.history.replaceState(null, "", `/account?b=${encodeURIComponent(code)}`);
    }
    function close() {
        setOpenCode(null);
        window.history.replaceState(null, "", "/account");
    }

    const navItems: { id: AccountTab; label: string; icon: React.ElementType; count?: number }[] = showBookings
        ? [
            { id: "upcoming", label: "Upcoming", icon: CalendarCheck, count: upcoming.length },
            { id: "history", label: "History", icon: HistoryIcon, count: history.length },
            { id: "refund", label: "Refund Policy", icon: RotateCcw },
            { id: "profile", label: "Profile", icon: UserRound },
        ]
        : [{ id: "profile", label: "Profile", icon: UserRound }];

    const next = upcoming.find((b) => b.bookingStatus !== "PENDING_PAYMENT");
    const rest = upcoming.filter((b) => b !== next);
    const today = new Date().toISOString().slice(0, 10);
    const groups = groupUpcoming(rest, today);

    return (
        <>
            <div className="grid gap-6 md:grid-cols-[15rem_1fr] md:gap-8">
                {/* Sidebar (vertical on md+, horizontal pills on mobile) */}
                <nav aria-label="Account sections" className="md:pr-2">
                    <ul className="grid grid-cols-4 gap-2 pb-2 md:flex md:flex-col md:gap-1 md:pb-0">
                        {navItems.map((item) => {
                            const active = tab === item.id;
                            const Icon = item.icon;
                            return (
                                <li key={item.id} className="md:shrink">
                                    <button
                                        type="button"
                                        role="tab"
                                        id={`tab-${item.id}`}
                                        aria-selected={active}
                                        aria-controls={`panel-${item.id}`}
                                        onClick={() => setTab(item.id)}
                                        className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors sm:text-sm md:justify-start md:gap-2.5 md:px-4 md:text-sm ${active
                                            ? "bg-teal text-white shadow-sm"
                                            : "bg-mint text-evergreen hover:bg-emerald/40"
                                            }`}
                                    >
                                        <Icon size={16} aria-hidden className="shrink-0" />
                                        <span className="truncate">{item.label}</span>
                                        {typeof item.count === "number" && (
                                            <span
                                                className={`ml-auto hidden rounded-full px-1.5 text-xs font-bold md:inline ${active ? "bg-white/20 text-white" : "bg-surface text-teal"
                                                    }`}
                                            >
                                                {item.count}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Content */}
                <div
                    role="tabpanel"
                    id={`panel-${tab}`}
                    aria-labelledby={`tab-${tab}`}
                    tabIndex={0}
                    className="min-w-0 space-y-6"
                >
                    {tab === "upcoming" && (
                        <>
                            {upcoming.length === 0 ? (
                                <EmptyState
                                    icon={CalendarX2}
                                    title={history.length === 0 ? "No bookings yet" : "No upcoming bookings"}
                                    description={
                                        history.length === 0
                                            ? "Book your first slot in a few taps. Pay a bKash advance to lock it in."
                                            : "You have no upcoming bookings. Pick a slot to play again."
                                    }
                                    action={{ href: "/book", label: "Book a slot" }}
                                />
                            ) : (
                                <>
                                    {next && <NextBookingCard b={merge(next)} onOpen={() => open(next.code)} />}

                                    {groups.length > 0 && (
                                        <div className="space-y-6">
                                            {groups.map((g) => (
                                                <section key={g.id} aria-labelledby={`group-${g.id}`} className="space-y-2.5">
                                                    <div className="flex items-baseline justify-between gap-3 px-1">
                                                        <h2
                                                            id={`group-${g.id}`}
                                                            className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-evergreen/60"
                                                        >
                                                            {g.label}
                                                        </h2>
                                                        <span className="text-xs font-semibold text-evergreen/50">
                                                            {g.items.length} {g.items.length === 1 ? "booking" : "bookings"}
                                                        </span>
                                                    </div>
                                                    <ul className="space-y-2.5">
                                                        {g.items.map((b) => (
                                                            <li key={b.code}>
                                                                <BookingRow b={merge(b)} onOpen={() => open(b.code)} />
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </section>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {tab === "history" &&
                        (history.length === 0 ? (
                            <EmptyState
                                icon={HistoryIcon}
                                title="No booking history"
                                description="Your past bookings will appear here once you have completed or cancelled a booking."
                            />
                        ) : (
                            <section aria-labelledby="group-history" className="space-y-2.5">
                                <div className="flex items-baseline justify-between gap-3 px-1">
                                    <h2
                                        id="group-history"
                                        className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-evergreen/60"
                                    >
                                        Past bookings
                                    </h2>
                                    <span className="text-xs font-semibold text-evergreen/50">
                                        {history.length} {history.length === 1 ? "booking" : "bookings"}
                                    </span>
                                </div>
                                <ul className="space-y-2.5">
                                    {history.map((b) => (
                                        <li key={b.code}>
                                            <BookingRow b={merge(b)} onOpen={() => open(b.code)} />
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}

                    {tab === "refund" && (
                        <RefundPolicyView policy={refundPolicy} />
                    )}

                    {tab === "profile" && <ProfileForms profile={profile} />}
                </div>
            </div>

            <SideSheet open={!!selected} onClose={close} title="Booking details">
                {selected && (
                    <BookingSheet
                        b={selected}
                        onRequested={(code, r) => setRequests((s) => ({ ...s, [code]: r }))}
                    />
                )}
            </SideSheet>
        </>
    );
}

function RefundPolicyView({
    policy,
}: {
    policy: {
        tiers: { when: string; outcome: string }[];
        method: string;
        timing: string;
        exceptions: string[];
    };
}) {
    const hasContent =
        policy.tiers.length > 0 || policy.method || policy.timing || policy.exceptions.length > 0;

    if (!hasContent) {
        return (
            <EmptyState
                icon={RotateCcw}
                title="Refund policy"
                description="Our refund policy is being finalised. Please contact the venue for cancellation and refund details."
            />
        );
    }

    return (
        <div className="space-y-5">
            <Card className="space-y-4">
                <div className="flex items-start gap-3 border-b border-evergreen/10 pb-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-mint text-teal">
                        <RotateCcw size={18} aria-hidden />
                    </span>
                    <div>
                        <h2 className="font-heading text-base font-bold leading-tight">Cancellation &amp; Refund Policy</h2>
                        <p className="mt-0.5 text-xs text-evergreen/70">
                            What happens to your advance if you cancel. All turfs are indoor — weather is never a reason for a refund.
                        </p>
                    </div>
                </div>

                {policy.tiers.length > 0 && (
                    <div className="space-y-3">
                        <p className="text-sm font-semibold">Cancellation windows</p>
                        <ul className="space-y-2">
                            {policy.tiers.map((t, i) => (
                                <li key={i} className="rounded-xl border border-evergreen/10 bg-surface p-3 text-sm">
                                    <p className="font-semibold text-evergreen">{t.when}</p>
                                    <p className="mt-0.5 text-evergreen/80">{t.outcome}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {policy.method && (
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-evergreen/60">Refund method</p>
                        <p className="text-sm text-evergreen/85">{policy.method}</p>
                    </div>
                )}

                {policy.timing && (
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-evergreen/60">Refund timing</p>
                        <p className="text-sm text-evergreen/85">{policy.timing}</p>
                    </div>
                )}

                {policy.exceptions.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-evergreen/60">Exceptions</p>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-evergreen/85">
                            {policy.exceptions.map((e, i) => (
                                <li key={i}>{e}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="rounded-xl bg-held-soft p-3 text-sm font-medium text-held">
                    If you have a dispute about a refund, please contact the venue directly. Last-minute cancellations
                    where the slot cannot be rebooked may not receive a full refund of the advance.
                </div>

                <a
                    href="/legal#refund"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-teal px-4 font-heading text-sm font-semibold text-teal hover:bg-mint"
                >
                    Read the full policy
                </a>
            </Card>
        </div>
    );
}

function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
    action?: { href: string; label: string };
}) {
    return (
        <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-mint text-teal">
                <Icon size={28} aria-hidden />
            </span>
            <div className="space-y-1.5">
                <p className="font-heading text-lg font-bold">{title}</p>
                <p className="mx-auto max-w-sm text-sm text-evergreen/70">{description}</p>
            </div>
            {action && (
                <Button href={action.href} size="lg">
                    <CalendarCheck size={18} aria-hidden /> {action.label}
                </Button>
            )}
        </Card>
    );
}