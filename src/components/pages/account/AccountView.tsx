"use client";
import { useMemo, useState } from "react";
import { CalendarCheck, CalendarX2, History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SideSheet } from "@/components/ui/SideSheet";
import { Tabs } from "@/components/ui/Tabs";
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

/** Group upcoming bookings by relative date. Pure string-date comparison — no timezone drift. */
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

export function AccountView({
    profile,
    upcoming,
    history,
    initialCode,
    showBookings,
}: {
    profile: { name: string; phone: string; email: string };
    upcoming: AccountBookingDto[];
    history: AccountBookingDto[];
    initialCode: string | null;
    showBookings: boolean;
}) {
    const all = useMemo(() => [...upcoming, ...history], [upcoming, history]);
    const inHistory = !!initialCode && history.some((b) => b.code === initialCode);

    const [tab, setTab] = useState<string>(
        showBookings ? (inHistory ? "history" : "upcoming") : "profile"
    );
    const [openCode, setOpenCode] = useState<string | null>(
        initialCode && all.some((b) => b.code === initialCode) ? initialCode : null
    );
    const [requests, setRequests] = useState<Record<string, ChangeRequestInfo>>({});

    const merge = (b: AccountBookingDto): AccountBookingDto =>
        requests[b.code] ? { ...b, changeRequest: requests[b.code], canRequestChange: false } : b;

    const selected = openCode ? all.map(merge).find((b) => b.code === openCode) : undefined;

    // Deep link: /account?b=<code>
    function open(code: string) {
        setOpenCode(code);
        window.history.replaceState(null, "", `/account?b=${encodeURIComponent(code)}`);
    }
    function close() {
        setOpenCode(null);
        window.history.replaceState(null, "", "/account");
    }

    const items = showBookings
        ? [
            { id: "upcoming", label: "Upcoming", count: upcoming.length },
            { id: "history", label: "History", count: history.length },
            { id: "profile", label: "Profile" },
        ]
        : [{ id: "profile", label: "Profile" }];

    const next = upcoming.find((b) => b.bookingStatus !== "PENDING_PAYMENT");
    const rest = upcoming.filter((b) => b !== next);

    // Group the remaining upcoming bookings by relative date.
    const today = new Date().toISOString().slice(0, 10);
    const groups = groupUpcoming(rest, today);

    return (
        <>
            <Tabs items={items} value={tab} onChange={setTab} label="Account sections" />

            <div
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
                tabIndex={0}
                className="mt-6 space-y-6"
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

                {tab === "profile" && <ProfileForms profile={profile} />}
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