"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Menu, X, UserRound, LogOut, UserCog,
    CalendarCheck, MapPin, Tag, Camera, HelpCircle, Phone,
} from "lucide-react";
import { site } from "@/data/site";
import { cn } from "@/lib/cn";
import type { SessionUser } from "@/types";

const navIcon: Record<string, React.ElementType> = {
    Pitches: MapPin,
    Rates: Tag,
    Gallery: Camera,
    FAQ: HelpCircle,
    Contact: Phone,
};

const barLink =
    "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-surface/10";

export function Header({ user }: { user: SessionUser | null }) {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const pathname = usePathname();
    const isStaff = user?.role === "STAFF" || user?.role === "SUPER_ADMIN";
    const isLogin = pathname === "/login";

    // Only the homepage has a dark hero for the bar to sit on. Every other route
    // gets a solid evergreen bar, so white text never lands on a near-white page.
    const overHero = pathname === "/" && !scrolled && !open;

    useEffect(() => setOpen(false), [pathname]);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

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

    if (isLogin) {
        return (
            <header className="absolute inset-x-0 top-0 z-40">
                <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
                    <Link
                        href="/"
                        className="whitespace-nowrap font-heading text-xl font-extrabold text-evergreen lg:text-white"
                    >
                        Kazi<span className="text-teal lg:text-emerald">Turf</span>
                        <span className="sr-only"> — {site.tagline}</span>
                    </Link>

                    <div className="flex items-center gap-2">
                        <Link
                            href="/"
                            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-evergreen transition-colors hover:bg-evergreen/10"
                        >
                            Home
                        </Link>
                        <Link
                            href="/book"
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-evergreen px-4 text-sm font-bold text-white transition-colors hover:bg-teal"
                        >
                            <CalendarCheck size={18} aria-hidden /> Book now
                        </Link>
                    </div>
                </div>
            </header>
        );
    }
    
    return (
        <header
            className={cn(
                "sticky top-0 z-40 border-b transition-colors duration-300",
                overHero
                    ? "border-transparent bg-transparent"
                    : "border-white/10 bg-evergreen/95 shadow-md backdrop-blur-md"
            )}
        >
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
                <div className="flex items-center gap-6">
                    <Link href="/" className="whitespace-nowrap font-heading text-xl font-extrabold text-white">
                        Kazi<span className="text-emerald">Turf</span>
                        <span className="sr-only"> — {site.tagline}</span>
                    </Link>

                    {/* Desktop primary nav */}
                    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
                        <Link
                            href="/"
                            aria-current={pathname === "/" ? "page" : undefined}
                            className={cn(barLink, pathname === "/" && "bg-surface/10")}
                        >
                            Home
                        </Link>
                    </nav>
                </div>

                <div className="flex items-center gap-1">
                    <Link
                        href="/"
                        aria-current={pathname === "/" ? "page" : undefined}
                        className={cn(barLink, "lg:hidden", pathname === "/" && "bg-surface/10")}
                    >
                        Home
                    </Link>

                    {user ? (
                        <>
                            <Link href="/account" className={barLink}>
                                <UserRound size={18} aria-hidden />
                                <span className="hidden sm:inline">Profile</span>
                            </Link>
                            <form action="/api/auth/signout" method="post" className="hidden sm:block">
                                <button type="submit" className={barLink}>
                                    <LogOut size={18} aria-hidden /> Logout
                                </button>
                            </form>
                            {isStaff && (
                                <Link
                                    href="/admin"
                                    className="hidden min-h-11 items-center rounded-xl border-2 border-white/40 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-surface/10 sm:inline-flex"
                                >
                                    Admin
                                </Link>
                            )}
                        </>
                    ) : (
                        <Link
                            href="/login"
                            className="inline-flex min-h-11 items-center rounded-xl bg-emerald px-4 py-2 text-sm font-bold text-evergreen transition-colors hover:bg-mint"
                        >
                            Sign In
                        </Link>
                    )}

                    {/* Primary CTA: desktop only. Phones already have the bottom action bar. */}
                    <Link
                        href="/book"
                        className="ml-1 hidden min-h-11 items-center gap-2 rounded-xl border-2 border-emerald px-4 text-sm font-bold text-emerald transition-colors hover:bg-emerald hover:text-evergreen md:inline-flex"
                    >
                        <CalendarCheck size={18} aria-hidden /> Book now
                    </Link>

                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                        aria-controls="site-menu"
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-surface/10 lg:hidden"
                    >
                        <span className="relative block h-6 w-6">
                            <Menu
                                size={24}
                                aria-hidden
                                className={cn("absolute inset-0 h-6 w-6 transition-opacity duration-150", open ? "opacity-0" : "opacity-100")}
                            />
                            <X
                                size={24}
                                aria-hidden
                                className={cn("absolute inset-0 h-6 w-6 transition-opacity duration-150", open ? "opacity-100" : "opacity-0")}
                            />
                        </span>
                    </button>
                </div>
            </div>

            {open && (
                <>
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 top-16 z-30 cursor-default bg-evergreen/40"
                    />
                    <div
                        id="site-menu"
                        className="absolute inset-x-0 top-full z-40 max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-evergreen/10 bg-surface shadow-2xl lg:hidden"
                    >
                        <nav aria-label="Site menu" className="mx-auto max-w-6xl px-4 py-6">
                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                <li>
                                    <MenuLink href="/book" icon={CalendarCheck} label="Book a slot" primary />
                                </li>
                                {navLinks.map((l) => (
                                    <li key={l.label}>
                                        <MenuLink href={l.href} icon={navIcon[l.label] ?? MapPin} label={l.label} />
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
                                    <li className="sm:hidden">
                                        <MenuLink href="/login" icon={UserRound} label="Sign in" />
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
    primary,
}: {
    href: string;
    icon: React.ElementType;
    label: string;
    primary?: boolean;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3 text-base font-semibold transition-colors",
                primary ? "bg-teal text-white hover:bg-evergreen" : "text-evergreen hover:bg-mint"
            )}
        >
            <span
                className={cn(
                    "inline-flex size-10 items-center justify-center rounded-xl",
                    primary ? "bg-surface/20 text-white" : "bg-mint text-teal"
                )}
            >
                <Icon size={20} aria-hidden />
            </span>
            {label}
        </Link>
    );
}