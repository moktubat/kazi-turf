"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

/** "" -> undefined so the schema reports it, otherwise a number. */
export const num = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

/** Comma-separated text <-> string[]. Keeps what the user is typing, including a trailing comma. */
export function ListInput({
    label,
    value,
    onChange,
    error,
    hint,
    placeholder,
}: {
    label: string;
    value: string[];
    onChange: (v: string[]) => void;
    error?: string;
    hint?: string;
    placeholder?: string;
}) {
    const [text, setText] = useState(value.join(", "));
    return (
        <Input
            label={label}
            value={text}
            placeholder={placeholder}
            hint={hint}
            error={error}
            onChange={(e) => {
                setText(e.target.value);
                onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean));
            }}
        />
    );
}

export function Check({
    label,
    checked,
    onChange,
    disabled,
}: {
    label: React.ReactNode;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
                type="checkbox"
                className="size-5 accent-teal"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span>{label}</span>
        </label>
    );
}

export function FormActions({
    busy,
    label,
    error,
    onCancel,
}: {
    busy: boolean;
    label: string;
    error: string | null;
    onCancel: () => void;
}) {
    return (
        <div className="space-y-3">
            {error && (
                <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                    {error}
                </p>
            )}
            <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={busy}>
                    {busy ? "Saving…" : label}
                </Button>
                <Button variant="ghost" onClick={onCancel} disabled={busy}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}