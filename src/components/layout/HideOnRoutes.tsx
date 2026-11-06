"use client";
import { usePathname } from "next/navigation";

/** Renders children everywhere except on the listed route prefixes. */
export function HideOnRoutes({
    prefixes,
    children,
}: {
    prefixes: string[];
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    if (prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
    return <>{children}</>;
}