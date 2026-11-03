"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, UserRound } from "lucide-react";
import { navLinks, site } from "@/data/site";
import { Button } from "@/components/ui/Button";
import type { SessionUser } from "@/types";

export function Header({ user }: { user: SessionUser | null }) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const isStaff = user?.role === "STAFF" || user?.role === "SUPER_ADMIN";

    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    return (
        <header className="sticky top-0 z-40 border-b border-evergreen/10 bg-[#F5F7F3] text-evergreen">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
                <Link href="/" className="font-heading text-xl font-extrabold text-evergreen">
                    Kazi<span className="text-teal">Turf</span>
                    <span className="sr-only"> — {site.tagline}</span>
                </Link>

                <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
                    {navLinks.map((l) => (
                        <Link
                            key={l.label}
                            href={l.href}
                            className="rounded-lg px-3 py-2 text-sm font-semibold text-evergreen hover:bg-evergreen/5"
                        >
                            {l.label}
                        </Link>
                    ))}
                </nav>

                <div className="hidden items-center gap-2 md:flex">
                    {user ? (
                        <>
                            <Link href="/account" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-evergreen">
                                <UserRound size={18} aria-hidden /> Account
                            </Link>
                            {isStaff && (
                                <Link href="/admin" className="rounded-lg border-2 border-evergreen px-3 py-1.5 text-sm font-semibold text-evergreen">
                                    Admin
                                </Link>
                            )}
                            <form action="/api/auth/signout" method="post">
                                <button type="submit" className="px-3 py-2 text-sm font-semibold text-evergreen">
                                    Logout
                                </button>
                            </form>
                        </>
                    ) : (
                        <Link href="/login" className="px-3 py-2 text-sm font-semibold text-evergreen">
                            Login / Sign up
                        </Link>
                    )}
                    <Button href="/book" className="bg-evergreen text-[#F5F7F3] hover:bg-teal">
                        Book Now
                    </Button>
                </div>

                <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-lg text-evergreen hover:bg-evergreen/5 md:hidden"
                    aria-label={open ? "Close menu" : "Open menu"}
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                >
                    {open ? <X size={24} aria-hidden /> : <Menu size={24} aria-hidden />}
                </button>
            </div>

            {open && (
                <nav aria-label="Mobile" className="border-t border-evergreen/10 bg-[#F5F7F3] px-4 pb-4 md:hidden">
                    {navLinks.map((l) => (
                        <Link key={l.label} href={l.href} className="flex min-h-12 items-center font-semibold text-evergreen">
                            {l.label}
                        </Link>
                    ))}
                    <Link href="/book" className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-evergreen font-semibold text-[#F5F7F3]">
                        Book Now
                    </Link>
                </nav>
            )}
        </header>
    );
}