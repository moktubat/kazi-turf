"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SideSheet } from "@/components/ui/SideSheet";
import { Tabs } from "@/components/ui/Tabs";
import type { AccountBookingDto, ChangeRequestInfo } from "@/types/account";
import { BookingRow } from "./BookingRow";
import { BookingSheet } from "./BookingSheet";
import { NextBookingCard } from "./NextBookingCard";
import { ProfileForms } from "./ProfileForms";

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

    const [tab, setTab] = useState<string>(showBookings ? (inHistory ? "history" : "upcoming") : "profile");
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
            { id: "upcoming", label: "Upcoming" },
            { id: "history", label: "History" },
            { id: "profile", label: "Profile" },
        ]
        : [{ id: "profile", label: "Profile" }];

    const next = upcoming.find((b) => b.bookingStatus !== "PENDING_PAYMENT");
    const rest = upcoming.filter((b) => b !== next);

    return (
        <>
            <Tabs items={items} value={tab} onChange={setTab} label="Account sections" />

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="mt-6 space-y-4">
                {tab === "upcoming" && (
                    <>
                        {upcoming.length === 0 ? (
                            <Card className="space-y-3 text-center">
                                <p className="font-heading text-lg font-bold">
                                    {history.length === 0 ? "No bookings yet" : "No upcoming bookings"}
                                </p>
                                <p className="text-sm text-evergreen/80">Book your first slot in a few taps.</p>
                                <div>
                                    <Button href="/book">Book a slot</Button>
                                </div>
                            </Card>
                        ) : (
                            <>
                                {next && <NextBookingCard b={merge(next)} onOpen={() => open(next.code)} />}
                                {rest.length > 0 && (
                                    <ul className="space-y-3">
                                        {rest.map((b) => (
                                            <li key={b.code}>
                                                <BookingRow b={merge(b)} onOpen={() => open(b.code)} />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}
                    </>
                )}

                {tab === "history" &&
                    (history.length === 0 ? (
                        <Card className="text-center">
                            <p className="text-sm text-evergreen/80">Past bookings appear here.</p>
                        </Card>
                    ) : (
                        <ul className="space-y-3">
                            {history.map((b) => (
                                <li key={b.code}>
                                    <BookingRow b={merge(b)} onOpen={() => open(b.code)} />
                                </li>
                            ))}
                        </ul>
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