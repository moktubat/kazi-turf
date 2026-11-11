import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookingFlow, type FlowInitial } from "@/components/pages/booking/BookingFlow";
import { BookingResult } from "@/components/pages/booking/BookingResult";
import type { FlowVenue } from "@/components/pages/booking/FilterBar";
import { Button } from "@/components/ui/Button";
import { venue } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays } from "@/lib/time";
import { getSessionUser } from "@/server/auth/session";
import { getPitch } from "@/server/availability";
import { todayDhaka } from "@/lib/time.server";

export const metadata: Metadata = { title: "Book a slot" };

type Params = Promise<Record<string, string | string[] | undefined>>;

function BookFallback() {
    return (
        <div className="mx-auto max-w-main px-4 py-6 pb-32 lg:pb-10">
            <div className="h-8 w-48 animate-pulse rounded bg-evergreen/10" />
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
                <div className="space-y-5">
                    <div className="h-20 animate-pulse rounded-2xl bg-evergreen/10" />
                    <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="h-[4.5rem] animate-pulse rounded-xl bg-evergreen/10" />
                        ))}
                    </div>
                </div>
                <div className="hidden h-64 animate-pulse rounded-2xl bg-evergreen/10 lg:block" />
            </div>
        </div>
    );
}

async function BookContent({ searchParams }: { searchParams: Params }) {
    const sp = await searchParams;

    const one = (k: string) => {
        const v = sp[k];
        return Array.isArray(v) ? v[0] : v;
    };

    const user = await getSessionUser();

    const code = one("booking");
    if (code) {
        if (!user) {
            redirect(`/login?next=${encodeURIComponent(`/book?booking=${code}`)}`);
        }
        return <BookingResult code={code} />;
    }

    if (venue.status !== "ACTIVE" || venue.sports.length === 0) {
        return (
            <div className="mx-auto max-w-xl px-4 py-16 text-center">
                <h1 className="text-2xl font-extrabold">Bookings open soon</h1>
                <p className="mt-2 text-evergreen/80">The venue is not taking online bookings yet.</p>
                <Button href="/" className="mt-6">Back to Home</Button>
            </div>
        );
    }
    const v: FlowVenue = {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        mapUrl: venue.mapUrl,
        sports: venue.sports,
    };

    const today = await todayDhaka();
    const maxDate = addDays(today, policies.bookingHorizonDays);

    const pitchId = one("pitch");
    const pitch = pitchId ? getPitch(pitchId) : undefined;

    const wantedSport = one("sport") ?? pitch?.sport;
    const sport =
        wantedSport && v.sports.includes(wantedSport)
            ? wantedSport
            : v.sports[0];

    const rawDate = one("date");
    const date =
        rawDate &&
            /^\d{4}-\d{2}-\d{2}$/.test(rawDate) &&
            rawDate >= today &&
            rawDate <= maxDate
            ? rawDate
            : today;

    const slot = one("slot");
    const validPitch =
        pitch && pitch.branchId === v.id && pitch.sport === sport
            ? pitch
            : undefined;

    const initial: FlowInitial = {
        sport,
        date,
        pitchId: validPitch?.id,
        slot: slot && /^\d{2}:\d{2}$/.test(slot) ? slot : undefined,
        restore: !one("pitch"),
    };

    return (
        <BookingFlow
            venue={v}
            initial={initial}
            minDate={today}
            maxDate={maxDate}
            user={user ? { name: user.name, phone: user.phone } : null}
            policy={{
                advancePercent: policies.advancePercent,
                nightAdvancePercent: policies.nightAdvancePercent ?? 100,
                holdMinutes: policies.holdMinutes,
                slotMinutes: policies.slotMinutes,
            }}
        />
    );
}

export default function BookPage({ searchParams }: { searchParams: Params }) {
    return (
        <Suspense fallback={<BookFallback />}>
            <BookContent searchParams={searchParams} />
        </Suspense>
    );
}