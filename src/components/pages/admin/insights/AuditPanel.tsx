import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/formatAdmin";
import { AUDIT_ACTIONS } from "@/types/ops";
import type { AuditRow } from "@/types/insights";

const label = (a: string) => a.replace(/_/g, " ").toLowerCase();

// Plain GET form: the search lives in the URL, so it can be shared and reloaded.
export function AuditPanel({
    rows,
    q,
    action,
    keep,
}: {
    rows: AuditRow[];
    q: string;
    action: string;
    keep: { from: string; to: string; branch: string };
}) {
    return (
        <section aria-labelledby="audit-title" className="space-y-3">
            <h2 id="audit-title" className="text-xl font-bold">Audit log</h2>

            <Card>
                <form method="get" className="grid gap-4 sm:grid-cols-[2fr_1.5fr_auto] sm:items-end" aria-label="Search audit log">
                    <input type="hidden" name="from" value={keep.from} />
                    <input type="hidden" name="to" value={keep.to} />
                    <input type="hidden" name="branch" value={keep.branch} />
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
                <Card><p className="text-sm text-evergreen/80">No audit entries match.</p></Card>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-evergreen/10 bg-white">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                        <caption className="sr-only">Audit log, newest first</caption>
                        <thead>
                            <tr className="border-b border-evergreen/10 text-xs uppercase tracking-wide text-evergreen/70">
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
                                        {r.branchName && <span className="block text-xs text-evergreen/70">{r.branchName}</span>}
                                    </td>
                                    <td className="px-3 py-3 text-xs text-evergreen/80">
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
            {rows.length >= 100 && <p className="text-xs text-evergreen/70">Showing the latest 100. Narrow the search to see older entries.</p>}
        </section>
    );
}