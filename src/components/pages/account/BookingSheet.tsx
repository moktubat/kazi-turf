"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Download, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Field";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { cancellationSummary } from "@/data/bookingCopy";
import { ApiError, api } from "@/lib/api";
import { formatBDT, formatDateLong } from "@/lib/format";
import { changeRequestSchema, type ChangeRequestInput } from "@/schemas/account";
import type { AccountBookingDto, ChangeRequestInfo } from "@/types/account";

function Line({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
    return (
        <div className={`flex items-baseline justify-between gap-4 ${strong ? "font-bold" : ""}`}>
            <dt className={strong ? "" : "text-evergreen/80"}>{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
        </div>
    );
}

export function BookingSheet({
    b,
    onRequested,
}: {
    b: AccountBookingDto;
    onRequested: (code: string, r: ChangeRequestInfo) => void;
}) {
    const [formOpen, setFormOpen] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<ChangeRequestInput>({
        resolver: zodResolver(changeRequestSchema),
        defaultValues: { kind: "CANCEL", reason: "" },
    });

    async function onSubmit(v: ChangeRequestInput) {
        setFormError(null);
        try {
            const r = await api<{ changeRequest: ChangeRequestInfo }>(
                `/api/bookings/${encodeURIComponent(b.code)}/change-request`,
                { method: "POST", body: JSON.stringify(v) }
            );
            onRequested(b.code, r.changeRequest);
            setFormOpen(false);
        } catch (e) {
            if (e instanceof ApiError) {
                if (e.fields) for (const [k, m] of Object.entries(e.fields)) setError(k as keyof ChangeRequestInput, { message: m });
                setFormError(e.message);
            } else setFormError("Something went wrong. Please try again.");
        }
    }

    const confirmed = ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(b.bookingStatus);

    return (
        <div className="space-y-5">
            <div className="space-y-3 text-center">
                <p className="text-sm text-evergreen/80">Booking code</p>
                <p className="font-mono text-3xl font-extrabold tracking-widest" aria-label={`Booking code ${b.code}`}>
                    {b.code}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <BookingStatusBadge status={b.bookingStatus} />
                    <PaymentStatusBadge status={b.paymentStatus} />
                </div>
            </div>

            {b.bookingStatus === "PENDING_PAYMENT" && b.holdActive && (
                <div className="rounded-xl bg-held-soft p-3 text-sm font-medium text-held">
                    Your slot is held but not paid yet.{" "}
                    <Link href={`/book?booking=${encodeURIComponent(b.code)}`} className="font-bold underline underline-offset-2">
                        Continue payment
                    </Link>
                </div>
            )}

            <dl className="space-y-1.5 text-sm">
                <Line label="Branch" value={b.branchName} />
                <Line label="Pitch" value={`${b.pitchName} · ${b.sport}`} />
                <Line label="Date" value={formatDateLong(b.date)} />
                <Line label="Time" value={`${b.start}–${b.end}`} />
            </dl>

            <dl className="space-y-1.5 rounded-xl bg-mint p-3 text-sm">
                <Line label="Subtotal" value={formatBDT(b.subtotal)} />
                {b.vatRatePercent && b.vatAmount > 0 && (
                    <Line
                        label={b.total === b.subtotal ? `Includes VAT (${b.vatRatePercent}%)` : `VAT (${b.vatRatePercent}%)`}
                        value={formatBDT(b.vatAmount)}
                    />
                )}
                <Line label="Total" value={formatBDT(b.total)} strong />
                <Line label="Advance paid" value={formatBDT(b.advancePaid)} />
                <Line label="Balance due at venue" value={formatBDT(b.balanceDue)} strong />
                {b.paymentReference && <Line label="Payment reference" value={<span className="font-mono">{b.paymentReference}</span>} />}
            </dl>

            {confirmed && (
                <p className="text-sm text-evergreen/85">
                    Show your code at the venue. Check-in opens {b.checkInOpensMinutes} minutes before your slot
                    starts and stays open until it ends. Staff may ask for the last digits of your phone number.
                </p>
            )}

            <div className="flex flex-wrap gap-2">
                {b.branchMapUrl && (
                    <Button href={b.branchMapUrl} variant="secondary">
                        <MapPin size={18} aria-hidden /> Directions
                    </Button>
                )}
                {b.advancePaid > 0 && (
                    // Receipt route arrives in Batch 6. Never offered before an advance is verified.
                    <a
                        href={`/api/bookings/${encodeURIComponent(b.code)}/receipt`}
                        download
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-teal px-4 font-heading text-sm font-semibold text-teal hover:bg-mint"
                    >
                        <Download size={18} aria-hidden /> Download receipt
                    </a>
                )}
            </div>

            {b.changeRequest ? (
                <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
                    <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" />
                    Your {b.changeRequest.kind === "CANCEL" ? "cancellation" : "reschedule"} request was sent. Our team will
                    review it and contact you. Nothing changes until it is confirmed.
                </p>
            ) : b.canRequestChange ? (
                <div className="space-y-3 border-t border-evergreen/10 pt-4">
                    {!formOpen ? (
                        <Button variant="outline" className="w-full" onClick={() => setFormOpen(true)}>
                            Request cancellation / reschedule
                        </Button>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Change request">
                            {cancellationSummary.map((line) => (
                                <p key={line} className="text-sm text-evergreen/85">{line}</p>
                            ))}
                            <p className="text-sm">
                                <Link href="/legal#refund" target="_blank" className="font-semibold text-teal underline underline-offset-2">
                                    Read the full policy
                                </Link>
                            </p>
                            <Select label="What do you need?" error={errors.kind?.message} {...register("kind")}>
                                <option value="CANCEL">Cancel this booking</option>
                                <option value="RESCHEDULE">Reschedule to another time</option>
                            </Select>
                            <Textarea label="Reason" rows={3} error={errors.reason?.message} {...register("reason")} />
                            {formError && (
                                <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{formError}</p>
                            )}
                            <div className="flex gap-2">
                                <Button type="submit" disabled={isSubmitting} className="flex-1">
                                    {isSubmitting ? "Sending…" : "Send request"}
                                </Button>
                                <Button variant="ghost" onClick={() => setFormOpen(false)}>
                                    Close
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            ) : null}
        </div>
    );
}