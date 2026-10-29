"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, MessageCircle, CalendarCheck } from "lucide-react";
import { site } from "@/data/site";

// Fixed bottom bar on public pages. /book renders its own summary bar.
const HIDDEN_PREFIXES = ["/book", "/admin", "/login"];

export function MobileActionBar() {
    const pathname = usePathname();
    if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

    return (
        <nav
            aria-label="Quick actions"
            className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-evergreen/10 bg-white md:hidden"
        >
            <div className="mx-auto flex max-w-md items-center gap-2 p-2">
                <Link
                    href="/book"
                    className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-teal font-heading font-semibold text-white"
                >
                    <CalendarCheck size={20} aria-hidden /> Book Now
                </Link>
                <a
                    href={`tel:${site.phone}`}
                    aria-label="Call us"
                    className="flex min-h-12 w-14 items-center justify-center rounded-xl bg-mint text-evergreen"
                >
                    <Phone size={20} aria-hidden />
                </a>
                <a
                    href={`https://wa.me/${site.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Chat on WhatsApp"
                    className="flex min-h-12 w-14 items-center justify-center rounded-xl bg-mint text-evergreen"
                >
                    <MessageCircle size={20} aria-hidden />
                </a>
            </div>
        </nav>
    );
}