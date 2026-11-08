import { Button } from "@/components/ui/Button";
import { formatBDT } from "@/lib/format";

// Sticky bottom bar on phones/tablets for Step 1. Primary action sits in the thumb zone.
export function SummaryBar({
    total,
    detail,
    disabled,
    onContinue,
}: {
    total: number | null;
    detail: string;
    disabled: boolean;
    onContinue: () => void;
}) {
    return (
        <div
            className="fixed inset-x-0 bottom-0 z-40 border-t border-evergreen/10 bg-surface/95 shadow-[0_-8px_24px_-12px_rgba(1,50,32,0.25)] backdrop-blur-md lg:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
            <div className="mx-auto flex max-w-xl items-center gap-3 p-3">
                <div className="min-w-0 flex-1" aria-live="polite">
                    <p className="font-heading text-lg font-extrabold leading-tight">
                        {total === null ? "No slot selected" : formatBDT(total)}
                    </p>
                    <p className="truncate text-xs text-evergreen/70">{detail}</p>
                </div>
                <Button size="lg" disabled={disabled} onClick={onContinue}>
                    Continue
                </Button>
            </div>
        </div>
    );
}