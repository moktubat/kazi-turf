"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ClipboardList, LayoutGrid, Settings, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Role } from "@/types";

// Sub-items shown under the expandable "Setup" parent in the sidebar.
const SETUP_CHILDREN: { tab: string; label: string }[] = [
    { tab: "venue", label: "Venue" },
    { tab: "pitches", label: "Fields" },
    { tab: "rates", label: "Slots" },
    { tab: "staff", label: "Staff" },
    { tab: "policies", label: "Policies" },
];

export function AdminNav({
    role,
    canSetup,
    variant = "bar",
}: {
    role: Role;
    canSetup: boolean;
    variant?: "bar" | "sidebar";
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentTab = searchParams.get("tab") ?? "venue";
    const onSetup = pathname === "/admin/setup" || pathname.startsWith("/admin/setup/");

    // Start expanded if we're already on the setup page.
    const [setupOpen, setSetupOpen] = useState(onSetup);

    // Mobile bar: ref + auto-scroll active link into view.
    // Declared BEFORE any early return so hook order is stable across renders.
    const navRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const root = navRef.current;
        if (!root) return;
        const active = root.querySelector<HTMLElement>('[aria-current="page"]');
        active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, [pathname]);

    const items = [
        { href: "/admin", label: "Desk", icon: LayoutGrid, exact: true, show: true, group: "Overview" },
        { href: "/admin/insights", label: "Insights", icon: TrendingUp, exact: false, show: role === "SUPER_ADMIN", group: "Overview" },
        { href: "/admin/bookings", label: "Bookings", icon: ClipboardList, exact: false, show: true, group: "Work" },
    ].filter((i) => i.show);

    const isActive = (href: string, exact: boolean) =>
        exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

    // ───────────────────────────── sidebar (desktop) ─────────────────────────────
    if (variant === "sidebar") {
        const groups = ["Overview", "Work"].filter((g) => items.some((i) => i.group === g));
        return (
            <nav aria-label="Admin" className="space-y-6">
                {groups.map((g) => (
                    <div key={g}>
                        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-evergreen/60">{g}</p>
                        <ul className="space-y-1">
                            {items
                                .filter((i) => i.group === g)
                                .map(({ href, label, icon: Icon, exact }) => {
                                    const active = isActive(href, exact);
                                    return (
                                        <li key={href}>
                                            <Link
                                                href={href}
                                                aria-current={active ? "page" : undefined}
                                                className={cn(
                                                    "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                                                    active ? "bg-mint text-teal" : "text-evergreen/80 hover:bg-mint/60"
                                                )}
                                            >
                                                {active && (
                                                    <span
                                                        aria-hidden
                                                        className="absolute -left-4 bottom-2 top-2 w-1 rounded-r bg-teal"
                                                    />
                                                )}
                                                <Icon size={18} aria-hidden /> {label}
                                            </Link>
                                        </li>
                                    );
                                })}
                        </ul>
                    </div>
                ))}

                {/* Admin group — Setup is an expandable parent */}
                {canSetup && (
                    <div>
                        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-evergreen/60">Admin</p>
                        <ul className="space-y-1">
                            <li>
                                {/* Parent: Setup — always visible, click to toggle children */}
                                <button
                                    type="button"
                                    onClick={() => setSetupOpen((v) => !v)}
                                    aria-expanded={setupOpen}
                                    aria-controls="setup-children"
                                    className={cn(
                                        "relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                                        onSetup ? "bg-mint text-teal" : "text-evergreen/80 hover:bg-mint/60"
                                    )}
                                >
                                    {onSetup && (
                                        <span
                                            aria-hidden
                                            className="absolute -left-4 bottom-2 top-2 w-1 rounded-r bg-teal"
                                        />
                                    )}
                                    <Settings size={18} aria-hidden /> Setup
                                    {/* Arrow — points down when expanded, right when collapsed */}
                                    <ChevronDown
                                        size={16}
                                        aria-hidden
                                        className={cn(
                                            "ml-auto transition-transform duration-200",
                                            setupOpen ? "rotate-180" : "rotate-0"
                                        )}
                                    />
                                </button>

                                {/* Children — Venue / Fields / Slots / Staff / Policies */}
                                {setupOpen && (
                                    <ul
                                        id="setup-children"
                                        className="mt-1 ml-4 space-y-0.5 border-l-2 border-evergreen/10 pl-3"
                                    >
                                        {SETUP_CHILDREN.map(({ tab, label }) => {
                                            const href = `/admin/setup?tab=${tab}`;
                                            const active = onSetup && currentTab === tab;
                                            return (
                                                <li key={tab}>
                                                    <Link
                                                        href={href}
                                                        aria-current={active ? "page" : undefined}
                                                        className={cn(
                                                            "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                                                            active
                                                                ? "bg-mint text-teal font-semibold"
                                                                : "text-evergreen/70 hover:bg-mint/40"
                                                        )}
                                                    >
                                                        <span
                                                            aria-hidden
                                                            className={cn(
                                                                "size-1.5 rounded-full",
                                                                active ? "bg-teal" : "bg-evergreen/30"
                                                            )}
                                                        />
                                                        {label}
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </li>
                        </ul>
                    </div>
                )}
            </nav>
        );
    }

    // ───────────────────────────── bar (mobile / tablet) ─────────────────────────────
    return (
        <nav
            ref={navRef}
            aria-label="Admin"
            className="scrollbar-visible flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-2 py-2"
        >
            {items.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(href, exact);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "inline-flex min-h-12 shrink-0 snap-center items-center gap-2 rounded-2xl border px-5 font-heading text-sm font-semibold transition-all",
                            active
                                ? "border-teal bg-teal text-white shadow-md"
                                : "border-evergreen/10 bg-mint text-evergreen hover:border-teal/40 hover:bg-emerald/30"
                        )}
                    >
                        <Icon size={18} aria-hidden /> {label}
                    </Link>
                );
            })}
            {canSetup && (
                <Link
                    href="/admin/setup"
                    aria-current={onSetup ? "page" : undefined}
                    className={cn(
                        "inline-flex min-h-12 shrink-0 snap-center items-center gap-2 rounded-2xl border px-5 font-heading text-sm font-semibold transition-all",
                        onSetup
                            ? "border-teal bg-teal text-white shadow-md"
                            : "border-evergreen/10 bg-mint text-evergreen hover:border-teal/40 hover:bg-emerald/30"
                    )}
                >
                    <Settings size={18} aria-hidden /> Setup
                </Link>
            )}
        </nav>
    );
}