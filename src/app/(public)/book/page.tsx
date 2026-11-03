import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingFlow, type FlowInitial } from "@/components/pages/booking/BookingFlow";
import { BookingResult } from "@/components/pages/booking/BookingResult";
import type { FlowVenue } from "@/components/pages/booking/FilterBar";
import { Button } from "@/components/ui/Button";
import { venue } from "@/data/branches";
import { policies } from "@/data/site";
import { addDays } from "@/lib/time";
import { getSessionUser } from "@/server/auth/session";
import { getPitch } from "@/server/availability";
import { connectDb } from "@/server/db/connect";
import { todayDhaka } from "@/lib/time.server";

export const metadata: Metadata = { title: "Book a slot" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function BookPage({ searchParams }: { searchParams: Params }) {
    await connectDb();
    const sp = await searchParams;

    const one = (k: string) => {
        const v = sp[k];
        return Array.isArray(v) ? v[0] : v;
    };

    const user = await getSessionUser();

    // Step 3: result – always server-verified
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

    // Resolve deep links safely – ignore anything invalid
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
                holdMinutes: policies.holdMinutes,
                slotMinutes: policies.slotMinutes,
            }}
        />
    );
}