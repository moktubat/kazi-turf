import { Suspense } from "react";
import { Hero } from "@/components/pages/home/Hero";
import { OpenToday } from "@/components/pages/home/OpenToday";
import { VenuesSection } from "@/components/pages/home/VenuesSection";
import { HowItWorks } from "@/components/pages/home/HowItWorks";
import { GallerySection } from "@/components/pages/home/GallerySection";
import { FaqSection } from "@/components/pages/home/FaqSection";
import { ContactSection } from "@/components/pages/home/ContactSection";
import { FinalCta } from "@/components/pages/home/FinalCta";

function HeroFallback() {
    return (
        <section className="bg-evergreen text-white">
            <div className="mx-auto max-w-6xl px-4 py-14 md:py-24">
                <div className="h-12 w-2/3 animate-pulse rounded bg-white/10" />
                <div className="mt-4 h-6 w-1/2 animate-pulse rounded bg-white/10" />
                <div className="mt-8 h-24 w-full animate-pulse rounded-2xl bg-white/10" />
            </div>
        </section>
    );
}

function SectionFallback() {
    return <div className="py-14 md:py-20" />;
}

export default function HomePage() {
    return (
        <>
            <Suspense fallback={<HeroFallback />}>
                <Hero />
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