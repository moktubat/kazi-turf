"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, MessageCircle, CalendarCheck } from "lucide-react";
import { site } from "@/data/site";

// Routes that have their own full-screen layout / CTA — bar is hidden there.
const HIDDEN_PREFIXES = ["/book", "/admin", "/login", "/account"];

export function MobileActionBar() {
    const pathname = usePathname();
    const path = pathname.replace(/\/$/, "") || "/";

    const hidden = HIDDEN_PREFIXES.some(
        (p) => path === p || path.startsWith(`${p}/`)
    );

    if (hidden) return null;

    return (
        <nav
            aria-label="Quick actions"
            // Inline styles for positioning — guarantees no Tailwind/CSS interaction
            // can clip or hide the bar. transform: translateZ(0) forces a GPU layer
            // so the bar is always rendered on top regardless of ancestor overflow.
            style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 50,
                transform: "translateZ(0)",
            }}
            className="safe-bottom border-t border-evergreen/10 bg-surface shadow-[0_-4px_16px_-12px_rgba(1,50,32,0.15)] md:hidden"
        >
            <div className="mx-auto flex max-w-sm items-center gap-1.5 p-2">
                <Link
                    href="/book"
                    className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-evergreen active:scale-[0.98]"
                >
                    <CalendarCheck size={16} aria-hidden /> Book Now
                </Link>

                <a
                    href={`tel:${site.phone}`}
                    aria-label="Call us"
                    className="flex min-h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-evergreen/15 bg-mint/60 text-evergreen transition-colors hover:bg-mint active:scale-[0.98]"
                >
                    <Phone size={18} aria-hidden />
                </a>

                <a
                    href={`https://wa.me/${site.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Chat on WhatsApp"
                    className="flex min-h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-evergreen/15 bg-mint/60 text-evergreen transition-colors hover:bg-mint active:scale-[0.98]"
                >
                    <MessageCircle size={18} aria-hidden />
                </a>
            </div>
        </nav>
    );
}