"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/formatAdmin";
import type { InquiryDto } from "@/types/insights";

export function InquiryInbox({ items }: { items: InquiryDto[] }) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const open = items.filter((i) => i.status === "NEW");
    const done = items.filter((i) => i.status === "HANDLED");

    async function handle(id: string) {
        setBusyId(id);
        setError(null);
        try {
            await api("/api/admin/inquiries", { method: "POST", body: JSON.stringify({ id }) });
            router.refresh();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not update. Please try again.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <section aria-labelledby="inbox-title" className="space-y-3">
            <div className="flex items-center gap-2">
                <h2 id="inbox-title" className="text-xl font-bold">Inquiries</h2>
                <Badge tone={open.length ? "held" : "neutral"}>{open.length} new</Badge>
            </div>
            {error && <p role="alert" className="text-sm font-medium text-booked">{error}</p>}

            {open.length === 0 ? (
                <Card><p className="text-sm text-evergreen/80">No new inquiries from the contact form.</p></Card>
            ) : (
                <ul className="space-y-3">
                    {open.map((q) => (
                        <li key={q.id}>
                            <Card className="space-y-2">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="font-bold">{q.name}</p>
                                    <p className="text-xs text-evergreen/70">{formatDateTime(q.createdAt)}</p>
                                </div>
                                <p className="text-sm font-semibold text-teal">{q.contact}</p>
                                <p className="whitespace-pre-wrap text-sm">{q.message}</p>
                                <Button variant="outline" disabled={busyId === q.id} onClick={() => handle(q.id)}>
                                    <Check size={16} aria-hidden /> {busyId === q.id ? "Saving…" : "Mark handled"}
                                </Button>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            {done.length > 0 && (
                <details className="rounded-xl border border-evergreen/10 bg-white p-3 text-sm">
                    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Handled ({done.length})</summary>
                    <ul className="mt-2 space-y-2">
                        {done.map((q) => (
                            <li key={q.id} className="border-t border-evergreen/10 pt-2">
                                <p className="font-semibold">{q.name} · <span className="font-normal">{q.contact}</span></p>
                                <p className="whitespace-pre-wrap text-evergreen/80">{q.message}</p>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}