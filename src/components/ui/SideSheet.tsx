"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Right-hand sheet on desktop, full screen on phones. Focus-trapped, Escape closes. */
export function SideSheet({
    open,
    onClose,
    title,
    description,
    icon: Icon,
    footer,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Optional one-line description shown under the title. */
    description?: string;
    /** Optional icon rendered in a tile to the left of the title. */
    icon?: React.ElementType;
    /** Optional sticky footer (e.g. Save / Cancel). */
    footer?: React.ReactNode;
    children: React.ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const titleId = useId();
    const descId = useId();

    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();

        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                onCloseRef.current();
                return;
            }
            if (e.key !== "Tab") return;
            const list = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
            if (!list || list.length === 0) return;
            const first = list[0];
            const last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
            opener?.focus?.();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-evergreen/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descId : undefined}
                className="absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-xl sm:max-w-md"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 bg-evergreen px-5 py-4 text-surface">
                    <div className="flex items-start gap-3 min-w-0">
                        {Icon && (
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface/15 text-emerald">
                                <Icon size={18} aria-hidden />
                            </span>
                        )}
                        <div className="min-w-0">
                            <h2 id={titleId} className="font-heading text-lg font-bold leading-tight">
                                {title}
                            </h2>
                            {description && (
                                <p id={descId} className="mt-0.5 text-sm text-surface/70">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        ref={closeRef}
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface/10"
                    >
                        <X size={20} aria-hidden />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5">{children}</div>

                {/* Optional sticky footer */}
                {footer && (
                    <div className="border-t border-evergreen/10 bg-surface px-5 py-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}