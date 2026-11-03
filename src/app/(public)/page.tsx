import { Suspense } from "react";
import { Hero } from "@/components/pages/home/Hero";
import { OpenToday } from "@/components/pages/home/OpenToday";
import { VenuesSection } from "@/components/pages/home/VenuesSection";
import { HowItWorks } from "@/components/pages/home/HowItWorks";
import { GallerySection } from "@/components/pages/home/GallerySection";
import { FaqSection } from "@/components/pages/home/FaqSection";
import { ContactSection } from "@/components/pages/home/ContactSection";
import { FinalCta } from "@/components/pages/home/FinalCta";
import { todayDhaka } from "@/lib/time.server";

function HeroFallback() {
    return (
        <section className="min-h-[100svh] bg-evergreen animate-pulse" />
    );
}

function SectionFallback() {
    return <div className="py-14 md:py-20" />;
}

async function HeroSection() {
    const today = await todayDhaka();
    return <Hero today={today} />;
}

export default function HomePage() {
    return (
        <>
            <Suspense fallback={<HeroFallback />}>
                <HeroSection />
            </Suspense>
            <Suspense fallback={<SectionFallback />}>
                <OpenToday />
            </Suspense>
            <VenuesSection />
            <HowItWorks />
            <GallerySection />
            <FaqSection />
            <ContactSection />
            <FinalCta />
        </>
    );
}