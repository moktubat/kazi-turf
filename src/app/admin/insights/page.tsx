import type { Metadata } from "next";
import { AttentionPanel } from "@/components/pages/admin/insights/AttentionPanel";
import { AuditPanel } from "@/components/pages/admin/insights/AuditPanel";
import { KpiCards, OccupancyHeatmap, RevenueChart, SourceSplit } from "@/components/pages/admin/insights/Charts";
import { InquiryInbox } from "@/components/pages/admin/insights/InquiryInbox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { branches } from "@/data/branches";
import { addDays, todayDhaka } from "@/lib/time";
import { getAttention, getAuditEntries, getInsights, listInquiries, MAX_RANGE_DAYS } from "@/server/admin/insights";
import { requireAdminPage } from "@/server/auth/pageGuards";
import { AUDIT_ACTIONS } from "@/types/ops";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

const validDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export default async function InsightsPage({ searchParams }: { searchParams: Params }) {
    const sp = await searchParams;
    const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
    const user = await requireAdminPage("/admin/insights");

    // Resolve filters safely: anything invalid falls back to a sensible default.
    const today = todayDhaka();
    const to = validDate(one("to")) ? one("to")! : today;
    let from = validDate(one("from")) ? one("from")! : addDays(to, -29);
    if (from > to) from = addDays(to, -29);
    if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) >= MAX_RANGE_DAYS * 86_400_000) {
        from = addDays(to, -(MAX_RANGE_DAYS - 1));
    }

    const branch = branches.some((b) => b.id === one("branch")) ? one("branch")! : "";
    const aq = (one("aq") ?? "").trim().slice(0, 60);
    const aa = (AUDIT_ACTIONS as readonly string[]).includes(one("aa") ?? "") ? one("aa")! : "";

    const [insights, attention, inquiries, audit] = await Promise.all([
        getInsights(user, { from, to, branch: branch || undefined }),
        getAttention(user, branch || undefined),
        listInquiries(user),
        getAuditEntries(user, { branch: branch || undefined, q: aq, action: aa }),
    ]);

    return (
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Insights</h1>

            <Card>
                <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end" aria-label="Filters">
                    <input type="hidden" name="aq" value={aq} />
                    <input type="hidden" name="aa" value={aa} />
                    <Input label="From" type="date" name="from" defaultValue={from} max={today} />
                    <Input label="To" type="date" name="to" defaultValue={to} max={today} />
                    <Select label="Branch" name="branch" defaultValue={branch}>
                        <option value="">All branches</option>
                        {branches
                            .filter((b) => b.status !== "COMING_SOON")
                            .map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                    </Select>
                    <Button type="submit">Apply</Button>
                </form>
                <p className="mt-3 text-xs text-evergreen/70">Up to {MAX_RANGE_DAYS} days. Dates are Asia/Dhaka.</p>
            </Card>

            <KpiCards k={insights.kpis} />

            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <RevenueChart data={insights.revenue} />
                <SourceSplit data={insights.source} />
            </div>

            <OccupancyHeatmap data={insights.heatmap} />

            <AttentionPanel groups={attention} role={user.role} />
            <InquiryInbox items={inquiries} />
            <AuditPanel rows={audit} q={aq} action={aa} keep={{ from, to, branch }} />
        </div>
    );
}