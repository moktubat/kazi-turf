import { cn } from "@/lib/cn";

export function Card({
    className,
    children,
    ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("rounded-2xl border border-evergreen/10 bg-white p-5 shadow-sm", className)}
            {...rest}
        >
            {children}
        </div>
    );
}