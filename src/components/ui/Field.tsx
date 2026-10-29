"use client";
import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

const control =
    "min-h-11 w-full rounded-xl border bg-white px-3 text-base text-evergreen placeholder:text-evergreen/50";

interface ShellProps {
    label: string;
    error?: string;
    hint?: string;
}

function Shell({
    id,
    label,
    error,
    hint,
    children,
}: ShellProps & { id: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-semibold text-evergreen">
                {label}
            </label>
            {children}
            {hint && !error && (
                <p id={`${id}-hint`} className="text-xs text-evergreen/70">
                    {hint}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} role="alert" className="text-sm font-medium text-booked">
                    {error}
                </p>
            )}
        </div>
    );
}

function describedBy(id: string, error?: string, hint?: string) {
    return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export const Input = forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement> & ShellProps
>(function Input({ label, error, hint, id, className, ...rest }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
        <Shell id={fid} label={label} error={error} hint={hint}>
            <input
                ref={ref}
                id={fid}
                aria-invalid={!!error}
                aria-describedby={describedBy(fid, error, hint)}
                className={cn(control, error ? "border-booked" : "border-evergreen/20", className)}
                {...rest}
            />
        </Shell>
    );
});

export const Select = forwardRef<
    HTMLSelectElement,
    React.SelectHTMLAttributes<HTMLSelectElement> & ShellProps
>(function Select({ label, error, hint, id, className, children, ...rest }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
        <Shell id={fid} label={label} error={error} hint={hint}>
            <select
                ref={ref}
                id={fid}
                aria-invalid={!!error}
                aria-describedby={describedBy(fid, error, hint)}
                className={cn(control, error ? "border-booked" : "border-evergreen/20", className)}
                {...rest}
            >
                {children}
            </select>
        </Shell>
    );
});

export const Textarea = forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement> & ShellProps
>(function Textarea({ label, error, hint, id, className, ...rest }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
        <Shell id={fid} label={label} error={error} hint={hint}>
            <textarea
                ref={ref}
                id={fid}
                aria-invalid={!!error}
                aria-describedby={describedBy(fid, error, hint)}
                className={cn(control, "py-2", error ? "border-booked" : "border-evergreen/20", className)}
                {...rest}
            />
        </Shell>
    );
});