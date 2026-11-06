import Image from "next/image";

const tile = "group relative overflow-hidden rounded-2xl bg-mint";

// Desktop placement (4 columns x 4 rows), matching the reference.
// On phones everything is one cell in 2 columns, except the video (2x2).
const photos = [
    { n: 1, cls: "md:col-start-1 md:row-start-1 md:row-span-2" },
    { n: 2, cls: "md:col-start-2 md:row-start-1" },
    { n: 3, cls: "md:col-start-3 md:row-start-1" },
    { n: 4, cls: "md:col-start-4 md:row-start-1 md:row-span-2" },
    { n: 5, cls: "md:col-start-1 md:row-start-3 md:row-span-2" },
    { n: 6, cls: "md:col-start-4 md:row-start-3" },
    { n: 7, cls: "md:col-start-2 md:row-start-4" },
    { n: 8, cls: "md:col-start-3 md:row-start-4 md:col-span-2" },
];

function Photo({ n, cls }: { n: number; cls: string }) {
    return (
        <li className={`${tile} ${cls}`}>
            <Image
                src={`/sports/galleryImage0${n}.webp`}
                alt={`KaziTurf venue photo ${n}`}
                fill
                sizes="(min-width: 1024px) 33vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
            />
        </li>
    );
}

export function GalleryBento() {
    return (
        <ul className="grid auto-rows-[9rem] grid-cols-2 gap-3 md:grid-cols-4 md:auto-rows-[10rem] lg:auto-rows-[12rem]">
            {photos.slice(0, 4).map((p) => (
                <Photo key={p.n} {...p} />
            ))}

            {/* Center video */}
            <li className={`${tile} col-span-2 row-span-2 md:col-start-2 md:row-start-2`}>
                <video
                    className="absolute inset-0 h-full w-full object-cover"
                    src="/sports/video.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label="KaziTurf venue video"
                />
            </li>

            {photos.slice(4).map((p) => (
                <Photo key={p.n} {...p} />
            ))}
        </ul>
    );
}