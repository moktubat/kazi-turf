import { Suspense } from "react";
import { connection } from "next/server";
import { Hero } from "@/components/pages/home/Hero";
import { Ticker } from "@/components/pages/home/Ticker";
import { VenuesSection } from "@/components/pages/home/VenuesSection";
import { HowItWorks } from "@/components/pages/home/HowItWorks";
import { GallerySection } from "@/components/pages/home/GallerySection";
import { FaqSection } from "@/components/pages/home/FaqSection";
import { ContactSection } from "@/components/pages/home/ContactSection";
import { FinalCta } from "@/components/pages/home/FinalCta";
import { todayDhaka } from "@/lib/time.server";
import { getPublicVenue, getPublicPolicies } from "@/server/public-data";
import { getBranchPitches } from "@/server/availability";
import type { Branch, Policies, Pitch } from "@/types";

function HeroFallback() {
    return <section className="min-h-[100svh] bg-evergreen animate-pulse" />;
}

async function HeroSection({ venue, policies }: { venue: Branch; policies: Policies }) {
    const today = await todayDhaka();
    // Fetch pitches for all sports so the Hero search form can list them in the Pitch dropdown
    const pitchesBySport = await Promise.all(
        venue.sports.map((sport) => getBranchPitches(venue.id, sport))
    );
    const pitches: Pitch[] = pitchesBySport.flat();
    return (
        <Hero today={today} venue={venue} policies={policies} pitches={pitches} />
    );
}

export const instant = false;

export default async function HomePage() {
    await connection();

    const [venue, policies] = await Promise.all([
        getPublicVenue(),
        getPublicPolicies(),
    ]);

    return (
        <>
            <Suspense fallback={<HeroFallback />}>
                <HeroSection venue={venue} policies={policies} />
            </Suspense>
            <Ticker venue={venue} policies={policies} />
            <VenuesSection venue={venue} />
            <HowItWorks policies={policies} />
            <GallerySection />
            <FaqSection policies={policies} />
            <ContactSection venue={venue} />
            <FinalCta venue={venue} />
        </>
    );
}