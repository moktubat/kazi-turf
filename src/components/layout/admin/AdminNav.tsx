"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutGrid, Settings, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Role } from "@/types";

// Role-aware navigation. The server still authorizes every page and API call.
export function AdminNav({ role, canSetup }: { role: Role; canSetup: boolean }) {
    const pathname = usePathname();
    const items = [
        { href: "/admin", label: "Desk", icon: LayoutGrid, exact: true, show: true },
        { href: "/admin/bookings", label: "Bookings", icon: ClipboardList, exact: false, show: true },
        { href: "/admin/setup", label: "Setup", icon: Settings, exact: false, show: canSetup },
        { href: "/admin/insights", label: "Insights", icon: TrendingUp, exact: false, show: role === "SUPER_ADMIN" },
    ].filter((i) => i.show);

    return (
        <nav aria-label="Admin" className="flex gap-2 overflow-x-auto py-2">
            {items.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 font-heading text-sm font-semibold",
                            active ? "bg-teal text-white" : "bg-mint text-evergreen hover:bg-emerald/40"
                        )}
                    >
                        <Icon size={16} aria-hidden /> {label}
                    </Link>
                );
            })}
        </nav>
    );
}