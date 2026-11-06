"use client";
import { cn } from "@/lib/cn";

/**
 * A labelled group of fields inside a SideSheet.
 * Header = icon tile + title + optional description.
 * Body = a clean vertical stack of children.
 */
export function SheetSection({
    icon: Icon,
    title,
    description,
    children,
    className,
}: {
    icon?: React.ElementType;
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("space-y-3", className)}>
            <div className="flex items-start gap-2.5">
                {Icon && (
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-mint text-teal">
                        <Icon size={14} aria-hidden />
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-sm font-bold leading-tight text-evergreen">{title}</h3>
                    {description && <p className="mt-0.5 text-xs text-evergreen/70">{description}</p>}
                </div>
            </div>
            <div className="space-y-4">{children}</div>
        </section>
    );
}