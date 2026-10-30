"use client";
import { useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { policySchema } from "@/schemas/setup";
import type { PolicyForm } from "@/types/setup";
import { Check, num } from "./ui";
import { useSave } from "./useSave";

export function PoliciesTab({ policies }: { policies: PolicyForm }) {
    const [f, setF] = useState({
        holdMinutes: String(policies.holdMinutes),
        advancePercent: String(policies.advancePercent),
        checkIn: String(policies.checkInOpensMinutesBefore),
        horizon: String(policies.bookingHorizonDays),
        vatRate: policies.vatRatePercent === null ? "" : String(policies.vatRatePercent),
        vatMode: policies.vatMode,
        vatReg: policies.vatRegistrationNo,
        tiers: policies.refund.tiers,
        method: policies.refund.method,
        timing: policies.refund.timing,
        rainEligibility: policies.refund.rainCheckEligibility,
        rainDays: policies.refund.rainCheckExpiryDays === null ? "" : String(policies.refund.rainCheckExpiryDays),
        exceptions: policies.refund.exceptions.join("\n"),
        reviewed: policies.legalReviewed,
    });
    const [saved, setSaved] = useState(false);
    const { busy, error, fields, save } = useSave();
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
        setSaved(false);
        setF((s) => ({ ...s, [k]: v }));
    };

    function setTier(i: number, key: "when" | "outcome", v: string) {
        set("tiers", f.tiers.map((t, idx) => (idx === i ? { ...t, [key]: v } : t)));
    }

    function submit(e: React.FormEvent) {
        e.preventDefault();
        setSaved(false);
        save(
            policySchema,
            {
                holdMinutes: num(f.holdMinutes),
                advancePercent: num(f.advancePercent),
                checkInOpensMinutesBefore: num(f.checkIn),
                bookingHorizonDays: num(f.horizon),
                vatRatePercent: f.vatRate.trim() === "" ? null : Number(f.vatRate),
                vatMode: f.vatMode,
                vatRegistrationNo: f.vatReg,
                refund: {
                    tiers: f.tiers,
                    method: f.method,
                    timing: f.timing,
                    rainCheckEligibility: f.rainEligibility,
                    rainCheckExpiryDays: f.rainDays.trim() === "" ? null : Number(f.rainDays),
                    exceptions: f.exceptions.split("\n").map((s) => s.trim()).filter(Boolean),
                },
                legalReviewed: f.reviewed,
            },
            "/api/admin/setup/policies",
            "PATCH",
            () => setSaved(true)
        );
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-6" aria-label="Policies">
            <p className="rounded-xl bg-mint p-3 text-sm">
                Changes apply to <strong>new bookings only</strong>. Existing bookings keep the price, VAT and advance percentage
                they were saved with.
            </p>

            <Card className="space-y-4">
                <h2 className="text-lg font-bold">Booking rules</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Slot hold (minutes)" type="number" inputMode="numeric" value={f.holdMinutes} error={fields.holdMinutes} hint="5–30" onChange={(e) => set("holdMinutes", e.target.value)} />
                    <Input label="Advance payment (%)" type="number" inputMode="numeric" value={f.advancePercent} error={fields.advancePercent} hint="Allowed range 30–50" onChange={(e) => set("advancePercent", e.target.value)} />
                    <Input label="Check-in opens (minutes before start)" type="number" inputMode="numeric" value={f.checkIn} error={fields.checkInOpensMinutesBefore} onChange={(e) => set("checkIn", e.target.value)} />
                    <Input label="Booking horizon (days ahead)" type="number" inputMode="numeric" value={f.horizon} error={fields.bookingHorizonDays} onChange={(e) => set("horizon", e.target.value)} />
                </div>
            </Card>

            <Card className="space-y-4">
                <h2 className="text-lg font-bold">VAT (optional)</h2>
                <p className="text-sm text-evergreen/80">Leave the rate empty and no VAT appears anywhere: summary, receipt or reports.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Input label="VAT rate (%)" type="number" step="0.01" inputMode="decimal" value={f.vatRate} error={fields.vatRatePercent} onChange={(e) => set("vatRate", e.target.value)} />
                    <Select label="Pricing" value={f.vatMode} onChange={(e) => set("vatMode", e.target.value as "inclusive" | "exclusive")}>
                        <option value="exclusive">VAT added on top</option>
                        <option value="inclusive">VAT included in price</option>
                    </Select>
                    <Input label="VAT registration no." value={f.vatReg} error={fields.vatRegistrationNo} hint="Printed on receipts when VAT is on." onChange={(e) => set("vatReg", e.target.value)} />
                </div>
            </Card>

            <Card className="space-y-4">
                <h2 className="text-lg font-bold">Cancellation, refund and rain-check</h2>
                <p className="text-sm text-evergreen/80">
                    This text is shown on the Legal page. Leave a field empty and the page says it is being finalised. It never shows invented terms.
                </p>

                <div className="space-y-3">
                    <p className="text-sm font-semibold">Cancellation windows and what happens to the advance</p>
                    {f.tiers.map((t, i) => (
                        <div key={i} className="grid gap-3 rounded-xl border border-evergreen/10 p-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                            <Input label="When" placeholder="More than 24 hours before start" value={t.when} error={fields[`refund.tiers.${i}.when`]} onChange={(e) => setTier(i, "when", e.target.value)} />
                            <Input label="Outcome" placeholder="Advance refunded in full" value={t.outcome} error={fields[`refund.tiers.${i}.outcome`]} onChange={(e) => setTier(i, "outcome", e.target.value)} />
                            <Button variant="ghost" aria-label={`Remove rule ${i + 1}`} onClick={() => set("tiers", f.tiers.filter((_, idx) => idx !== i))}>
                                <Trash2 size={18} aria-hidden />
                            </Button>
                        </div>
                    ))}
                    {f.tiers.length < 6 && (
                        <Button variant="outline" onClick={() => set("tiers", [...f.tiers, { when: "", outcome: "" }])}>
                            <Plus size={16} aria-hidden /> Add rule
                        </Button>
                    )}
                    {fields["refund"] && <p role="alert" className="text-sm font-medium text-booked">{fields["refund"]}</p>}
                </div>

                <Input label="Refund method" value={f.method} error={fields["refund.method"]} onChange={(e) => set("method", e.target.value)} />
                <Input label="Refund timing" value={f.timing} error={fields["refund.timing"]} onChange={(e) => set("timing", e.target.value)} />
                <Textarea label="Rain-check eligibility" rows={2} value={f.rainEligibility} error={fields["refund.rainCheckEligibility"]} onChange={(e) => set("rainEligibility", e.target.value)} />
                <Input label="Rain-check expiry (days)" type="number" inputMode="numeric" value={f.rainDays} error={fields["refund.rainCheckExpiryDays"]} onChange={(e) => set("rainDays", e.target.value)} />
                <Textarea label="Exceptions (one per line)" rows={3} value={f.exceptions} error={fields["refund.exceptions"]} onChange={(e) => set("exceptions", e.target.value)} />
            </Card>

            <Card className="space-y-2">
                <h2 className="text-lg font-bold">Legal review</h2>
                <Check label="The owner or a legal adviser has reviewed the Terms, Privacy and Refund text" checked={f.reviewed} onChange={(v) => set("reviewed", v)} />
                <p className="text-xs text-evergreen/70">While unchecked, the Legal page shows a &quot;being finalised&quot; notice.</p>
            </Card>

            {error && <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{error}</p>}
            {saved && (
                <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
                    <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" /> Policies saved.
                </p>
            )}
            <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Saving…" : "Save policies"}
            </Button>
        </form>
    );
}