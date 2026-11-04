"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, MessageCircle, CalendarCheck } from "lucide-react";
import { site } from "@/data/site";

// /admin and /login have their own layouts.
const HIDDEN_PREFIXES = ["/book", "/admin", "/login"];

export function MobileActionBar() {
    const pathname = usePathname();
    if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

    return (
        <nav
            aria-label="Quick actions"
            className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-evergreen/10 bg-white/70 backdrop-blur-md md:hidden"
        >
            <div className="mx-auto flex max-w-md items-center gap-2 p-2.5 shadow-[0_-4px_20px_-12px_rgba(1,50,32,0.15)]">
                {/* Primary: Book Now — takes most of the width */}
                <Link
                    href="/book"
                    className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-4 font-heading text-sm font-semibold text-white shadow-sm transition-colors hover:bg-evergreen active:scale-[0.98]"
                >
                    <CalendarCheck size={18} aria-hidden /> Book Now
                </Link>

                {/* Secondary: Call */}
                <a
                    href={`tel:${site.phone}`}
                    aria-label="Call us"
                    className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-evergreen/15 bg-white/60 text-evergreen transition-colors hover:bg-mint active:scale-[0.98]"
                >
                    <Phone size={20} aria-hidden />
                </a>

                {/* Secondary: WhatsApp */}
                <a
                    href={`https://wa.me/${site.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Chat on WhatsApp"
                    className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-evergreen/15 bg-white/60 text-evergreen transition-colors hover:bg-mint active:scale-[0.98]"
                >
                    <MessageCircle size={20} aria-hidden />
                </a>
            </div>
        </nav>
    );
}