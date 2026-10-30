import { Hero } from "@/components/pages/home/Hero";
import { OpenToday } from "@/components/pages/home/OpenToday";
import { VenuesSection } from "@/components/pages/home/VenuesSection";
import { HowItWorks } from "@/components/pages/home/HowItWorks";
import { GallerySection } from "@/components/pages/home/GallerySection";
import { FaqSection } from "@/components/pages/home/FaqSection";
import { ContactSection } from "@/components/pages/home/ContactSection";
import { FinalCta } from "@/components/pages/home/FinalCta";

// "Open Today" depends on the clock, so refresh the page data every minute.
export const revalidate = 60;

export default function HomePage() {
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