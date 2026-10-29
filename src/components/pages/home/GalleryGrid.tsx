"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GalleryImage } from "@/data/gallery";

export function GalleryGrid({ items }: { items: GalleryImage[] }) {
    const [index, setIndex] = useState<number | null>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const open = index !== null;

    const close = useCallback(() => {
        setIndex(null);
        openerRef.current?.focus();
    }, []);

    const step = useCallback(
        (d: number) => setIndex((i) => (i === null ? i : (i + d + items.length) % items.length)),
        [items.length]
    );

    useEffect(() => {
        if (!open) return;
        closeRef.current?.focus();

        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") close();
            else if (e.key === "ArrowLeft") step(-1);
            else if (e.key === "ArrowRight") step(1);
            else if (e.key === "Tab") {
                const f = dialogRef.current?.querySelectorAll<HTMLElement>("button");
                if (!f || f.length === 0) return;
                const first = f[0];
                const last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }

        document.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, close, step]);

    const shown = items.slice(0, 9);

    return (
        <>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {shown.map((img, i) => (
                    <li key={img.src}>
                        <button
                            type="button"
                            aria-label={`View photo: ${img.alt}`}
                            onClick={(e) => {
                                openerRef.current = e.currentTarget;
                                setIndex(i);
                            }}
                            className="relative block aspect-4/3 w-full overflow-hidden rounded-xl bg-mint"
                        >
                            <Image
                                src={img.src}
                                alt={img.alt}
                                fill
                                sizes="(min-width: 768px) 33vw, 50vw"
                                className="object-cover transition-transform hover:scale-105"
                                loading="lazy"
                            />
                        </button>
                    </li>
                ))}
            </ul>

            {open && index !== null && (
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Photo viewer"
                    className="fixed inset-0 z-50 flex flex-col bg-evergreen/95 p-4"
                >
                    <div className="flex items-center justify-between text-white">
                        <p className="text-sm" aria-live="polite">
                            {index + 1} / {shown.length}
                        </p>
                        <button
                            ref={closeRef}
                            type="button"
                            aria-label="Close viewer"
                            onClick={close}
                            className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-white/10"
                        >
                            <X size={24} aria-hidden />
                        </button>
                    </div>

                    <div className="relative my-3 min-h-0 flex-1">
                        <Image
                            src={shown[index].src}
                            alt={shown[index].alt}
                            fill
                            sizes="100vw"
                            className="object-contain"
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4 text-white">
                        <button
                            type="button"
                            aria-label="Previous photo"
                            onClick={() => step(-1)}
                            className="inline-flex size-12 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
                        >
                            <ChevronLeft size={24} aria-hidden />
                        </button>
                        <p className="text-center text-sm">{shown[index].alt}</p>
                        <button
                            type="button"
                            aria-label="Next photo"
                            onClick={() => step(1)}
                            className="inline-flex size-12 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
                        >
                            <ChevronRight size={24} aria-hidden />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}