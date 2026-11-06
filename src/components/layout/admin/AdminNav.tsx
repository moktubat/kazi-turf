"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutGrid, Settings, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Role } from "@/types";

// Role-aware navigation. The server still authorizes every page and API call.
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
    const items = [
        { href: "/admin", label: "Desk", icon: LayoutGrid, exact: true, show: true, group: "Overview" },
        { href: "/admin/insights", label: "Insights", icon: TrendingUp, exact: false, show: role === "SUPER_ADMIN", group: "Overview" },
        { href: "/admin/bookings", label: "Bookings", icon: ClipboardList, exact: false, show: true, group: "Work" },
        { href: "/admin/setup", label: "Setup", icon: Settings, exact: false, show: canSetup, group: "Admin" },
    ].filter((i) => i.show);

    const isActive = (href: string, exact: boolean) =>
        exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

    if (variant === "sidebar") {
        const groups = ["Overview", "Work", "Admin"].filter((g) => items.some((i) => i.group === g));
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
            </nav>
        );
    }

    return (
        <nav aria-label="Admin" className="flex gap-2 overflow-x-auto py-2">
            {items.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(href, exact);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 font-heading text-sm font-semibold",
                            active ? "bg-teal text-white shadow-sm" : "bg-mint text-evergreen hover:bg-emerald/40"
                        )}
                    >
                        <Icon size={16} aria-hidden /> {label}
                    </Link>
                );
            })}
        </nav>
    );
}