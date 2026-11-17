import { Section } from "./Section";
import { GalleryBento } from "./GalleryBento";

export function GallerySection() {
    return (
        <Section id="gallery" tone="canvas" eyebrow="The venue" title="Gallery" intro="A look inside the arena in Shabgram, Bogura.">
            <GalleryBento />
        </Section>
    );
}