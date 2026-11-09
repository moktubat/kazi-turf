import { Suspense } from "react";
import { connection } from "next/server";    // ← ADD THIS IMPORT
import { Hero } from "@/components/pages/home/Hero";
import { HeroKickOffs, KickOffsFallback } from "@/components/pages/home/HeroKickOffs";
import { Ticker } from "@/components/pages/home/Ticker";
import { VenuesSection } from "@/components/pages/home/VenuesSection";
import { HowItWorks } from "@/components/pages/home/HowItWorks";
import { GallerySection } from "@/components/pages/home/GallerySection";
import { FaqSection } from "@/components/pages/home/FaqSection";
import { ContactSection } from "@/components/pages/home/ContactSection";
import { FinalCta } from "@/components/pages/home/FinalCta";
import { todayDhaka } from "@/lib/time.server";
import { getPublicVenue, getPublicPolicies } from "@/server/public-data";
import type { Branch, Policies } from "@/types";

function HeroFallback() {
    return <section className="min-h-[100svh] bg-evergreen animate-pulse" />;
}

async function HeroSection({ venue, policies }: { venue: Branch; policies: Policies }) {
    const today = await todayDhaka();

    return (
        <Hero
            today={today}
            venue={venue}
            policies={policies}
            aside={
                <Suspense fallback={<KickOffsFallback />}>
                    <HeroKickOffs today={today} />
                </Suspense>
            }
        />
    );
}

export default async function HomePage() {
    // FIX: Opt out of static prerendering.
    // This page reads from MongoDB (which internally calls new Date()),
    // so it cannot be statically prerendered. connection() marks it dynamic.
    await connection();

    const [venue, policies] = await Promise.all([
        getPublicVenue(),
        getPublicPolicies(),
    ]);

    console.log("[home-page] venue:", venue?.id, venue?.name, "| sports:", venue?.sports?.length);
    console.log("[home-page] policies:", policies ? `slotMinutes=${policies.slotMinutes} advance=${policies.advancePercent}` : "NULL");

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