"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Right-hand sheet on desktop, full screen on phones.
 *
 * Rendered in a portal at document.body so it escapes any ancestor
 * `transform` / `will-change` / `filter` (e.g. GSAP's Reveal wrapper on the
 * home page sections). Without the portal, `position: fixed` becomes
 * `position: absolute` relative to the transformed ancestor, and the dialog
 * flickers / jumps when the ancestor's transform updates.
 */
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
    description?: string;
    icon?: React.ElementType;
    footer?: React.ReactNode;
    children: React.ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const titleId = useId();
    const descId = useId();

    // Keep the DOM mounted briefly after close so the slide-out transition plays.
    const [mounted, setMounted] = useState(false);
    // Prevent the overlay from catching the opening click for a brief moment.
    const [overlayReady, setOverlayReady] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);
            setOverlayReady(false);
            return;
        }
        if (!mounted) return;
        const t = setTimeout(() => setMounted(false), 250);
        return () => clearTimeout(t);
    }, [open, mounted]);

    // Focus trap + body scroll lock — only while truly open.
    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        const raf = requestAnimationFrame(() => closeRef.current?.focus());

        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.stopPropagation();
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

        // Let the slide-in finish before the overlay becomes clickable.
        const readyTimer = setTimeout(() => setOverlayReady(true), 250);

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
            clearTimeout(readyTimer);
            setOverlayReady(false);
            opener?.focus?.();
        };
    }, [open]);

    // Not mounted (or SSR) → render nothing.
    if (!mounted || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50">
            {/* Overlay — fades in/out, not clickable until the slide-in finishes */}
            <div
                className={`absolute inset-0 bg-evergreen/60 backdrop-blur-sm transition-opacity duration-200 ease-out ${open ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                onClick={overlayReady ? onClose : undefined}
                aria-hidden
            />

            {/* Panel — slides in from the right */}
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descId : undefined}
                className={`absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-xl transition-transform duration-200 ease-out sm:max-w-md ${open ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 bg-evergreen px-5 py-4 text-surface">
                    <div className="flex min-w-0 items-start gap-3">
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
                    <div className="border-t border-evergreen/10 bg-surface px-5 py-3">{footer}</div>
                )}
            </div>
        </div>,
        document.body
    );
}