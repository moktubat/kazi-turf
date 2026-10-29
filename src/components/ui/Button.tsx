import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    href?: string;
}

const variants: Record<Variant, string> = {
    primary: "bg-teal text-white hover:bg-evergreen",
    secondary: "bg-mint text-evergreen hover:bg-emerald",
    outline: "border-2 border-teal text-teal hover:bg-mint",
    ghost: "text-evergreen hover:bg-mint",
    danger: "bg-booked text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
    md: "min-h-11 px-4 text-sm",
    lg: "min-h-12 px-6 text-base",
};

export function Button({
    variant = "primary",
    size = "md",
    href,
    className,
    children,
    ...rest
}: ButtonProps) {
    const classes = cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-heading font-semibold",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
    );

    if (href) {
        const external = /^(https?:|tel:|mailto:)/.test(href);
        if (external) {
            return (
                <a href={href} className={classes} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    {children}
                </a>
            );
        }
        return (
            <Link href={href} className={classes}>
                {children}
            </Link>
        );
    }

    return (
        <button type="button" className={classes} {...rest}>
            {children}
        </button>
    );
}