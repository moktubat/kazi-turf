import { Camera } from "lucide-react";
import { gallery } from "@/data/gallery";
import { Section } from "./Section";
import { GalleryGrid } from "./GalleryGrid";

export function GallerySection() {
    return (
        <Section id="gallery" title="Gallery" intro="Photos from our venues.">
            {gallery.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-evergreen/20 bg-white p-10 text-center">
                    <Camera size={32} aria-hidden className="text-teal" />
                    <p className="font-heading font-bold">Venue photos coming soon</p>
                    <p className="text-sm text-evergreen/70">We only show real photos from our branches.</p>
                </div>
            ) : (
                <GalleryGrid items={gallery} />
            )}
        </Section>
    );
}