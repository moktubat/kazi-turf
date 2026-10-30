"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Right-hand sheet on desktop, full screen on phones. Focus-trapped, Escape closes. */
export function SideSheet({
    open,
    onClose,
    title,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const titleId = useId();

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
            <div className="absolute inset-0 bg-evergreen/60" onClick={onClose} aria-hidden />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-xl sm:max-w-md"
            >
                <div className="flex items-center justify-between border-b border-evergreen/10 px-4 py-3">
                    <h2 id={titleId} className="text-lg font-bold">
                        {title}
                    </h2>
                    <button
                        ref={closeRef}
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-mint"
                    >
                        <X size={22} aria-hidden />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">{children}</div>
            </div>
        </div>
    );
}