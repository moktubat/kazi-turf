"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Menu, X, UserRound, LogOut, UserCog,
    CalendarCheck, MapPin, Tag, Camera, HelpCircle, Phone,
} from "lucide-react";
import { navLinks, site } from "@/data/site";
import { cn } from "@/lib/cn";
import type { SessionUser } from "@/types";

const navIcon: Record<string, React.ElementType> = {
    Pitches: MapPin,
    Rates: Tag,
    Gallery: Camera,
    FAQ: HelpCircle,
    Contact: Phone,
};

export function Header({ user }: { user: SessionUser | null }) {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const pathname = usePathname();
    const isStaff = user?.role === "STAFF" || user?.role === "SUPER_ADMIN";

    // Close the menu on every route change.
    useEffect(() => setOpen(false), [pathname]);

    // Transparent at the very top; subtle frosted blur once the user scrolls.
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Escape closes the menu; lock body scroll while it is open.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open]);

    return (
        <header
            className={cn(
                "sticky top-0 z-40 transition-colors duration-300",
                scrolled
                    ? "border-b border-evergreen/10 bg-white/40 backdrop-blur-sm"
                    : "border-b border-transparent bg-transparent"
            )}
        >
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 text-evergreen">
                {/* Left: logo */}
                <Link
                    href="/"
                    className="whitespace-nowrap font-heading text-xl font-extrabold text-white"
                >
                    Kazi<span className="text-teal">Turf</span>
                    <span className="sr-only"> — {site.tagline}</span>
                </Link>

                {/* Right: in-bar links + auth + hamburger */}
                <div className="flex items-center gap-1">
                    {/* Home always visible in the bar */}
                    <Link
                        href="/"
                        className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-white hover:bg-evergreen/5"
                    >
                        Home
                    </Link>

                    {user ? (
                        <>
                            <Link
                                href="/account"
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white hover:bg-evergreen/5"
                            >
                                <UserRound size={18} aria-hidden />
                                <span className="hidden sm:inline">Profile</span>
                            </Link>
                            <form action="/api/auth/signout" method="post" className="hidden sm:block">
                                <button
                                    type="submit"
                                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white hover:bg-evergreen/5"
                                >
                                    <LogOut size={18} aria-hidden /> Logout
                                </button>
                            </form>
                            {isStaff && (
                                <Link
                                    href="/admin"
                                    className="hidden min-h-11 items-center rounded-xl border-2 border-evergreen px-3 py-1.5 text-sm font-semibold text-evergreen hover:bg-mint sm:inline-flex"
                                >
                                    Admin
                                </Link>
                            )}
                        </>
                    ) : (
                        <Link
                            href="/login"
                            className="inline-flex min-h-11 items-center rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-evergreen"
                        >
                            Sign In
                        </Link>
                    )}

                    {/* Hamburger — both icons overlay in a fixed-size box.
                        Only opacity changes on click, so there is NO width shift. */}
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                        aria-controls="site-menu"
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-white hover:bg-evergreen/5"
                    >
                        <span className="relative block h-6 w-6">
                            <Menu
                                size={24}
                                aria-hidden
                                className={cn(
                                    "absolute inset-0 h-6 w-6 transition-opacity duration-150",
                                    open ? "opacity-0" : "opacity-100"
                                )}
                            />
                            <X
                                size={24}
                                aria-hidden
                                className={cn(
                                    "absolute inset-0 h-6 w-6 transition-opacity duration-150",
                                    open ? "opacity-100" : "opacity-0"
                                )}
                            />
                        </span>
                    </button>
                </div>
            </div>

            {/* Big dropdown menu */}
            {open && (
                <>
                    {/* click-outside catcher */}
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 top-16 z-30 cursor-default"
                    />
                    <div
                        id="site-menu"
                        className="absolute inset-x-0 top-full z-40 border-t border-evergreen/10 bg-white shadow-2xl"
                    >
                        <nav aria-label="Site menu" className="mx-auto max-w-6xl px-4 py-6">
                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                <li>
                                    <MenuLink href="/book" icon={CalendarCheck} label="Book a slot" />
                                </li>
                                {navLinks.map((l) => (
                                    <li key={l.label}>
                                        <MenuLink
                                            href={l.href}
                                            icon={navIcon[l.label] ?? MapPin}
                                            label={l.label}
                                        />
                                    </li>
                                ))}

                                {user ? (
                                    <>
                                        <li>
                                            <MenuLink href="/account" icon={UserRound} label="My account" />
                                        </li>
                                        {isStaff && (
                                            <li>
                                                <MenuLink href="/admin" icon={UserCog} label="Admin desk" />
                                            </li>
                                        )}
                                        {/* Logout shows in the dropdown only on mobile
                                            (desktop has it in the bar) */}
                                        <li className="sm:hidden">
                                            <form action="/api/auth/signout" method="post">
                                                <button
                                                    type="submit"
                                                    className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-base font-semibold text-booked hover:bg-booked-soft"
                                                >
                                                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-booked-soft text-booked">
                                                        <LogOut size={20} aria-hidden />
                                                    </span>
                                                    Logout
                                                </button>
                                            </form>
                                        </li>
                                    </>
                                ) : (
                                    /* Sign-in tile in the dropdown only on mobile */
                                    <li className="sm:hidden">
                                        <Link
                                            href="/login"
                                            className="flex min-h-14 items-center gap-3 rounded-2xl bg-teal px-4 py-3 text-base font-semibold text-white hover:bg-evergreen"
                                        >
                                            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white/20 text-white">
                                                <UserRound size={20} aria-hidden />
                                            </span>
                                            Sign in
                                        </Link>
                                    </li>
                                )}
                            </ul>
                        </nav>
                    </div>
                </>
            )}
        </header>
    );
}

function MenuLink({
    href,
    icon: Icon,
    label,
}: {
    href: string;
    icon: React.ElementType;
    label: string;
}) {
    return (
        <Link
            href={href}
            className="flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3 text-base font-semibold text-evergreen transition-colors hover:bg-mint"
        >
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-mint text-teal">
                <Icon size={20} aria-hidden />
            </span>
            {label}
        </Link>
    );
}