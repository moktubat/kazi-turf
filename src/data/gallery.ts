// Real venue photos only. No stock images presented as a KaziTurf branch.
// Put files in /public/gallery and add entries, 6-9 recommended:
//   { src: "/gallery/bogura-pitch-a.jpg", alt: "Pitch A under floodlights at the Bogura branch" }
export interface GalleryImage {
    src: string;
    alt: string;
}

export const gallery: GalleryImage[] = [];