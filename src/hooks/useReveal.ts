"use client";
import { useEffect, useRef } from "react";

/**
 * GSAP scroll reveal. Safe by design:
 * - skipped for prefers-reduced-motion
 * - skipped for anything already in the viewport (no flash, nothing hidden at load)
 * - GSAP is loaded lazily so Home's initial JS stays small
 */
export function useReveal<T extends HTMLElement>() {
    const ref = useRef<T>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (!("IntersectionObserver" in window)) return;
        if (el.getBoundingClientRect().top < window.innerHeight) return;

        let cancelled = false;
        let io: IntersectionObserver | undefined;

        import("gsap").then(({ gsap }) => {
            if (cancelled) return;
            gsap.set(el, { opacity: 0, y: 24 });
            io = new IntersectionObserver(
                (entries) => {
                    if (!entries[0].isIntersecting) return;
                    gsap.to(el, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", clearProps: "opacity,transform" });
                    io?.disconnect();
                },
                { rootMargin: "0px 0px -10% 0px" }
            );
            io.observe(el);
        });

        return () => {
            cancelled = true;
            io?.disconnect();
            el.style.removeProperty("opacity");
            el.style.removeProperty("transform");
        };
    }, []);

    return ref;
}