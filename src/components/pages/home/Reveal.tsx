"use client";
import { useReveal } from "@/hooks/useReveal";

export function Reveal({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const ref = useReveal<HTMLDivElement>();
    return (
        <div ref={ref} className={className}>
            {children}
        </div>
    );
}