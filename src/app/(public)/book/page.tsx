import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookingFlow, type FlowInitial } from "@/components/pages/booking/BookingFlow";
import { BookingResult } from "@/components/pages/booking/BookingResult";
import type { FlowBranch } from "@/components/pages/booking/FilterBar";
import { Button } from "@/components/ui/Button";
import { branches } from "@/data/branches";
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

    const active: FlowBranch[] = branches
        .filter((b) => b.status === "ACTIVE" && b.sports.length > 0)
        .map(({ id, name, address, mapUrl, sports }) => ({ id, name, address, mapUrl, sports }));

    if (active.length === 0) {
        return (
            <div className="mx-auto max-w-xl px-4 py-16 text-center">
                <h1 className="text-2xl font-extrabold">Bookings open soon</h1>
                <p className="mt-2 text-evergreen/80">No branch is taking online bookings yet.</p>
                <Button href="/" className="mt-6">Back to Home</Button>
            </div>
        );
    }

    // Resolve deep links safely – ignore anything invalid
    const today = await todayDhaka();
    const maxDate = addDays(today, policies.bookingHorizonDays);

    const pitchId = one("pitch");
    const pitch = pitchId ? getPitch(pitchId) : undefined;

    const wantedBranch = one("branch") ?? pitch?.branchId;
    const branch = active.find((b) => b.id === wantedBranch) ?? active[0];

    const wantedSport = one("sport") ?? pitch?.sport;
    const sport =
        wantedSport && branch.sports.includes(wantedSport)
            ? wantedSport
            : branch.sports[0];

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
        pitch && pitch.branchId === branch.id && pitch.sport === sport
            ? pitch
            : undefined;

    const initial: FlowInitial = {
        branchId: branch.id,
        sport,
        date,
        pitchId: validPitch?.id,
        slot: slot && /^\d{2}:\d{2}$/.test(slot) ? slot : undefined,
        restore: !one("branch") && !one("pitch"),
    };

    return (
        <BookingFlow
            branches={active}
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