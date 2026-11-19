import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/formatAdmin";
import { AUDIT_ACTIONS } from "@/types/ops";
import type { AuditRow } from "@/types/insights";

const label = (a: string) => a.replace(/_/g, " ").toLowerCase();

const PAGE_SIZE = 25;

/** Page numbers to show: all when few, a 7-wide window around the current page otherwise. */
function pageNumbers(page: number, pages: number): (number | "…")[] {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const nums = new Set<number>([1, pages, page - 1, page, page + 1]);
    const list = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    for (let i = 0; i < list.length; i++) {
        if (i > 0 && list[i] - list[i - 1] > 1) out.push("…");
        out.push(list[i]);
    }
    return out;
}

// Plain GET form + links: the search and the page live in the URL, so they can be shared and reloaded.
export function AuditPanel({
    rows,
    q,
    action,
    keep,
    page,
    pages,
    total,
}: {
    rows: AuditRow[];
    q: string;
    action: string;
    keep: { from: string; to: string; sport?: string };
    page: number;
    pages: number;
    total: number;
}) {
    // Rebuild the query string for a given audit page, preserving every filter.
    const hrefFor = (p: number) => {
        const sp = new URLSearchParams();
        sp.set("from", keep.from);
        sp.set("to", keep.to);
        if (keep.sport) sp.set("sport", keep.sport);
        if (q) sp.set("aq", q);
        if (action) sp.set("aa", action);
        sp.set("ap", String(p));
        return `/admin/insights?${sp.toString()}`;
    };

    const fromRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const toRow = Math.min(total, page * PAGE_SIZE);

    return (
        <section aria-labelledby="audit-title" className="space-y-3">
            <h2 id="audit-title" className="text-xl font-bold">Audit log</h2>

            <Card>
                <form method="get" className="grid gap-4 sm:grid-cols-[2fr_1.5fr_auto] sm:items-end" aria-label="Search audit log">
                    <input type="hidden" name="from" value={keep.from} />
                    <input type="hidden" name="to" value={keep.to} />
                    {keep.sport !== undefined && <input type="hidden" name="sport" value={keep.sport} />}
                    <Input label="Search" type="search" name="aq" defaultValue={q} placeholder="Actor, booking code, detail…" />
                    <Select label="Action" name="aa" defaultValue={action}>
                        <option value="">All actions</option>
                        {AUDIT_ACTIONS.map((a) => (
                            <option key={a} value={a}>{label(a)}</option>
                        ))}
                    </Select>
                    <Button type="submit">Search</Button>
                </form>
            </Card>

            {rows.length === 0 ? (
                <Card><p className="text-sm text-evergreen/70">No audit entries match.</p></Card>
            ) : (
                <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-evergreen/10 bg-surface shadow-sm">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                        <caption className="sr-only">Audit log, newest first</caption>
                        <thead>
                            <tr className="border-b border-evergreen/10 bg-mint/60 text-xs uppercase tracking-wide text-evergreen/70">
                                {["When", "Who", "Action", "Item", "Details"].map((h) => (
                                    <th key={h} scope="col" className="px-3 py-3 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-evergreen/5 align-top last:border-0">
                                    <td className="whitespace-nowrap px-3 py-3">{formatDateTime(r.at)}</td>
                                    <td className="px-3 py-3">{r.actorName}</td>
                                    <td className="px-3 py-3 font-semibold">{label(r.action)}</td>
                                    <td className="px-3 py-3">
                                        <span className="font-mono text-xs">{r.entityId}</span>
                                    </td>
                                    <td className="break-words px-3 py-3 text-xs text-evergreen/80">
                                        {Object.entries(r.meta)
                                            .filter(([, v]) => v !== null && v !== "")
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(" · ")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-evergreen/70">
                        {fromRow}–{toRow} of {total} · {PAGE_SIZE} per page · entries older than 30 days are deleted automatically
                    </p>
                    {pages > 1 && (
                        <nav aria-label="Audit log pages" className="flex flex-wrap items-center gap-1">
                            {page > 1 ? (
                                <Link href={hrefFor(page - 1)} className="rounded-lg border border-evergreen/15 px-2.5 py-1 text-xs font-semibold hover:border-teal">
                                    ‹ Prev
                                </Link>
                            ) : (
                                <span aria-disabled="true" className="rounded-lg border border-evergreen/10 px-2.5 py-1 text-xs text-evergreen/40">‹ Prev</span>
                            )}
                            {pageNumbers(page, pages).map((n, i) =>
                                n === "…" ? (
                                    <span key={`e${i}`} className="px-1 text-xs text-evergreen/40">…</span>
                                ) : n === page ? (
                                    <span key={n} aria-current="page" className="rounded-lg bg-teal px-2.5 py-1 text-xs font-semibold text-white">{n}</span>
                                ) : (
                                    <Link key={n} href={hrefFor(n)} className="rounded-lg border border-evergreen/15 px-2.5 py-1 text-xs font-semibold hover:border-teal">
                                        {n}
                                    </Link>
                                )
                            )}
                            {page < pages ? (
                                <Link href={hrefFor(page + 1)} className="rounded-lg border border-evergreen/15 px-2.5 py-1 text-xs font-semibold hover:border-teal">
                                    Next ›
                                </Link>
                            ) : (
                                <span aria-disabled="true" className="rounded-lg border border-evergreen/10 px-2.5 py-1 text-xs text-evergreen/40">Next ›</span>
                            )}
                        </nav>
                    )}
                </div>
            )}
        </section>
    );
}