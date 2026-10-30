"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { BookingPanel } from "@/components/pages/admin/BookingPanel";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SideSheet } from "@/components/ui/SideSheet";
import type { Role } from "@/types";
import type { AttentionGroup } from "@/types/insights";

export function AttentionPanel({ groups, role }: { groups: AttentionGroup[]; role: Role }) {
    const router = useRouter();
    const [code, setCode] = useState<string | null>(null);
    const all = groups.every((g) => g.count === 0);

    return (
        <section aria-labelledby="attention-title" className="space-y-3">
            <h2 id="attention-title" className="text-xl font-bold">Needs attention</h2>

            {all && (
                <Card className="flex items-center gap-2">
                    <CheckCircle2 size={20} aria-hidden className="text-teal" />
                    <p className="font-semibold">Nothing needs attention right now.</p>
                </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                {groups.map((g) => (
                    <Card key={g.id} className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h3 className="font-bold">{g.title}</h3>
                                <p className="text-xs text-evergreen/70">{g.hint}</p>
                            </div>
                            <Badge tone={g.count > 0 && g.id !== "expired" ? "held" : "neutral"}>{g.count}</Badge>
                        </div>

                        {g.items.length === 0 ? (
                            <p className="text-sm text-evergreen/70">Nothing to review.</p>
                        ) : (
                            <ul className="divide-y divide-evergreen/10 rounded-xl border border-evergreen/10">
                                {g.items.map((it) => (
                                    <li key={it.code}>
                                        <button
                                            type="button"
                                            onClick={() => setCode(it.code)}
                                            className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-mint"
                                        >
                                            <span className="min-w-0">
                                                <span className="font-mono text-sm font-bold">{it.code}</span>
                                                <span className="ml-2 text-sm">{it.title}</span>
                                                <span className="block truncate text-xs text-evergreen/70">{it.detail}</span>
                                            </span>
                                            <ChevronRight size={18} aria-hidden className="shrink-0 text-evergreen/50" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {g.count > g.items.length && (
                            <p className="text-xs text-evergreen/70">Showing {g.items.length} of {g.count}. Use Bookings to see the rest.</p>
                        )}
                    </Card>
                ))}
            </div>

            <SideSheet open={!!code} onClose={() => setCode(null)} title="Booking">
                {code && <BookingPanel code={code} role={role} onChanged={() => router.refresh()} />}
            </SideSheet>
        </section>
    );
}