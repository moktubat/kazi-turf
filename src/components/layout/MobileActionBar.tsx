"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, MessageCircle, CalendarCheck } from "lucide-react";
import { site } from "@/data/site";

// Routes that have their own layout / CTA / full-screen form.
const HIDDEN_PREFIXES = ["/book", "/admin", "/login"];

export function MobileActionBar() {
    const pathname = usePathname();
    const [visible, setVisible] = useState(true);
    const lastScrollRef = useRef(0);

    // Hide on home (tons of CTAs already), plus the routes with their own layout.
    const hidden =
        pathname === "/" ||
        HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

    useEffect(() => {
        if (hidden) return;
        const onScroll = () => {
            const current = window.scrollY;
            const last = lastScrollRef.current;
            const scrollingDown = current > last && current > 120;
            // Always show near the bottom so it never traps the footer's copyright bar.
            const nearBottom =
                current + window.innerHeight >= document.body.scrollHeight - 140;
            if (nearBottom || !scrollingDown) {
                setVisible(true);
            } else {
                setVisible(false);
            }
            lastScrollRef.current = current;
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [hidden]);

    if (hidden) return null;

    return (
        <nav
            aria-label="Quick actions"
            aria-hidden={!visible}
            className={`safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-evergreen/10 bg-surface/95 shadow-[0_-4px_20px_-12px_rgba(1,50,32,0.15)] backdrop-blur-md transition-transform duration-300 md:hidden ${visible ? "translate-y-0" : "translate-y-full"
                }`}
        >
            <div className="mx-auto flex max-w-md items-center gap-2 p-2.5">
                {/* Primary: Book Now — takes most of the width */}
                <Link
                    href="/book"
                    className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-4 font-heading text-sm font-semibold text-mint shadow-sm transition-colors hover:bg-evergreen active:scale-[0.98]"
                >
                    <CalendarCheck size={18} aria-hidden /> Book Now
                </Link>

                {/* Secondary: Call */}
                <a
                    href={`tel:${site.phone}`}
                    aria-label="Call us"
                    className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-evergreen/15 bg-mint/60 text-evergreen transition-colors hover:bg-mint active:scale-[0.98]"
                >
                    <Phone size={20} aria-hidden />
                </a>

                {/* Secondary: WhatsApp */}
                <a
                    href={`https://wa.me/${site.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Chat on WhatsApp"
                    className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-evergreen/15 bg-mint/60 text-evergreen transition-colors hover:bg-mint active:scale-[0.98]"
                >
                    <MessageCircle size={20} aria-hidden />
                </a>
            </div>
        </nav>
    );
}