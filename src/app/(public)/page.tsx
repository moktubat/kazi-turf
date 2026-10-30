import { Hero } from "@/components/pages/home/Hero";
import { OpenToday } from "@/components/pages/home/OpenToday";
import { VenuesSection } from "@/components/pages/home/VenuesSection";
import { HowItWorks } from "@/components/pages/home/HowItWorks";
import { GallerySection } from "@/components/pages/home/GallerySection";
import { FaqSection } from "@/components/pages/home/FaqSection";
import { ContactSection } from "@/components/pages/home/ContactSection";
import { FinalCta } from "@/components/pages/home/FinalCta";
import { connectDb } from "@/server/db/connect";

export default async function HomePage() {
    await connectDb();
    return (
        <>
            <Hero />
            <OpenToday />
            <VenuesSection />
            <HowItWorks />
            <GallerySection />
            <FaqSection />
            <ContactSection />
            <FinalCta />
        </>
    );
}