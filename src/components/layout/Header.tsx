"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, UserRound } from "lucide-react";
import { navLinks, site } from "@/data/site";
import { Button } from "@/components/ui/Button";
import type { SessionUser } from "@/types";
import { cn } from "@/lib/cn";

export function Header({ user }: { user: SessionUser | null }) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const isHome = pathname === "/";
    const [scrolled, setScrolled] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const isStaff = user?.role === "STAFF" || user?.role === "SUPER_ADMIN";

    useEffect(() => {
        if (!isHome) {
            setScrolled(true);
            return;
        }
        const onScroll = () => setScrolled(window.scrollY > 80);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [isHome]);

    // Close drawer on navigation
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // Focus trap + Escape + scroll lock
    useEffect(() => {
        if (!open) return;
        const el = drawerRef.current;
        if (!el) return;
        const focusable = Array.from(el.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        focusable[0]?.focus();

        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setOpen(false);
                triggerRef.current?.focus();
                return;
            }
            if (e.key !== "Tab" || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open]);

    return (
        <header className={cn(
            "sticky top-0 z-40 transition-all duration-300",
            scrolled
                ? "border-b border-evergreen/10 bg-white/95 backdrop-blur"
                : isHome
                    ? "bg-transparent"
                    : "border-b border-evergreen/10 bg-white/95 backdrop-blur"
        )}>
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
                <Link href="/" className={cn(
                    "font-heading text-xl font-extrabold transition-colors",
                    scrolled ? "text-evergreen" : "text-white"
                )}>
                    Kazi<span className="text-emerald">Turf</span>
                    <span className="sr-only"> — {site.tagline}</span>
                </Link>

                {/* Desktop nav */}
                <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
                    {navLinks.map((l) => (
                        <Link
                            key={l.label}
                            href={l.href}
                            className={cn(
                                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                scrolled
                                    ? "text-evergreen hover:bg-mint"
                                    : "text-white hover:bg-white/10"
                            )}
                        >
                            {l.label}
                        </Link>
                    ))}
                </nav>

                <div className="hidden items-center gap-2 md:flex">
                    {user ? (
                        <>
                            <Button href="/account" variant={scrolled ? "ghost" : "ghost"} className={scrolled ? "" : "text-white hover:bg-white/10"}>
                                <UserRound size={18} aria-hidden /> Account
                            </Button>
                            {isStaff && (
                                <Button href="/admin" variant="outline" className={scrolled ? "" : "border-white text-white hover:bg-white/10"}>
                                    Admin
                                </Button>
                            )}
                            <form action="/api/auth/signout" method="post">
                                <Button type="submit" variant="ghost">
                                    Logout
                                </Button>
                            </form>
                        </>
                    ) : (
                        <Button href="/login" variant="ghost" className={scrolled ? "" : "text-white hover:bg-white/10"}>
                            Login / Sign up
                        </Button>
                    )}
                    <Button href="/book" className={scrolled ? "" : "bg-white text-evergreen hover:bg-white/90"}>Book Now</Button>
                </div>

                {/* Mobile trigger */}
                <button
                    ref={triggerRef}
                    type="button"
                    className={cn(
                        "inline-flex size-11 items-center justify-center rounded-lg md:hidden",
                        scrolled ? "hover:bg-mint" : "text-white hover:bg-white/10"
                    )}
                    aria-label="Open menu"
                    aria-expanded={open}
                    aria-controls="mobile-drawer"
                    onClick={() => setOpen(true)}
                >
                    <Menu size={24} aria-hidden />
                </button>
            </div>

            {/* Mobile drawer */}
            {open && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <div className="absolute inset-0 bg-evergreen/60" onClick={() => setOpen(false)} aria-hidden />
                    <div
                        ref={drawerRef}
                        id="mobile-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menu"
                        className="absolute right-0 top-0 flex h-full w-[85%] max-w-sm flex-col gap-2 bg-white p-4 shadow-xl"
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-heading text-lg font-bold">Menu</span>
                            <button
                                type="button"
                                className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-mint"
                                aria-label="Close menu"
                                onClick={() => {
                                    setOpen(false);
                                    triggerRef.current?.focus();
                                }}
                            >
                                <X size={24} aria-hidden />
                            </button>
                        </div>

                        <nav aria-label="Mobile" className="mt-2 flex flex-col">
                            {navLinks.map((l) => (
                                <Link
                                    key={l.label}
                                    href={l.href}
                                    className="flex min-h-12 items-center rounded-lg px-3 font-medium hover:bg-mint"
                                >
                                    {l.label}
                                </Link>
                            ))}
                            {user ? (
                                <>
                                    <Link href="/account" className="flex min-h-12 items-center rounded-lg px-3 font-medium hover:bg-mint">
                                        Account
                                    </Link>
                                    {isStaff && (
                                        <Link href="/admin" className="flex min-h-12 items-center rounded-lg px-3 font-medium hover:bg-mint">
                                            Admin
                                        </Link>
                                    )}
                                </>
                            ) : (
                                <Link href="/login" className="flex min-h-12 items-center rounded-lg px-3 font-medium hover:bg-mint">
                                    Login / Sign up
                                </Link>
                            )}
                        </nav>

                        <div className="mt-auto flex flex-col gap-2">
                            <Button href="/book" size="lg">
                                Book Now
                            </Button>
                            {user && (
                                <form action="/api/auth/signout" method="post">
                                    <Button type="submit" variant="outline" size="lg" className="w-full">
                                        Logout
                                    </Button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}