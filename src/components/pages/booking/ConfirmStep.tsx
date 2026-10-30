"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowLeft, Wallet } from "lucide-react";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { cancellationSummary } from "@/data/bookingCopy";
import { ApiError, api } from "@/lib/api";
import { formatBDT } from "@/lib/format";
import { startBkashPayment } from "@/lib/payments";
import { confirmFormSchema, type ConfirmFormInput } from "@/schemas/booking";
import type { BookingDto } from "@/types/booking";
import { HoldCountdown } from "./HoldCountdown";
import { SummaryCard, type Amounts, type SelectionInfo } from "./SummaryCard";

export interface FlowUser {
    name: string;
    phone: string;
}

export function ConfirmStep({
    info,
    amounts,
    loading,
    advancePercent,
    user,
    selection,
    hold,
    onBack,
    onHeld,
    onTaken,
    onPickAgain,
    onAuthed,
}: {
    info: SelectionInfo;
    amounts: Amounts | null;
    loading: boolean;
    advancePercent: number;
    user: FlowUser | null;
    selection: { pitchId: string; cellStarts: string[] };
    hold: BookingDto | null;
    onBack: () => void;
    onHeld: (b: BookingDto) => void;
    onTaken: (message: string) => void;
    onPickAgain: () => void;
    onAuthed: () => void;
}) {
    const [formError, setFormError] = useState<string | null>(null);
    const [expired, setExpired] = useState(false);
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        setValue,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<ConfirmFormInput>({
        resolver: zodResolver(confirmFormSchema),
        defaultValues: { phone: user?.phone ?? "", acceptPolicy: false },
    });

    // Prefill after inline sign-in without losing the selection.
    useEffect(() => {
        if (user?.phone) setValue("phone", user.phone);
    }, [user?.phone, setValue]);

    async function onSubmit(v: ConfirmFormInput) {
        setFormError(null);
        try {
            const r = await api<{ booking: BookingDto }>("/api/bookings", {
                method: "POST",
                body: JSON.stringify({
                    pitchId: selection.pitchId,
                    cellStarts: selection.cellStarts,
                    phone: v.phone,
                    acceptPolicy: v.acceptPolicy,
                }),
            });
            onHeld(r.booking);
        } catch (e) {
            if (e instanceof ApiError) {
                if (e.code === "SLOT_UNAVAILABLE") return onTaken(e.message);
                if (e.fields) {
                    for (const [k, msg] of Object.entries(e.fields)) setError(k as keyof ConfirmFormInput, { message: msg });
                }
                setFormError(e.message);
            } else {
                setFormError("Something went wrong. Please try again.");
            }
        }
    }

    async function pay() {
        if (!hold) return;
        setPaying(true);
        setPayError(null);
        try {
            await startBkashPayment(hold.code);
        } catch (e) {
            setPayError(e instanceof ApiError ? e.message : "Could not start payment. Please try again.");
            setPaying(false);
        }
    }

    const advance = hold?.advanceAmount ?? amounts?.advance ?? 0;
    const canContinue = !!user && !!amounts && !loading && !isSubmitting;

    const primary = hold ? (
        <Button size="lg" className="w-full" onClick={pay} disabled={paying || expired}>
            <Wallet size={18} aria-hidden /> {paying ? "Opening bKash…" : `Pay ${formatBDT(advance)} advance with bKash`}
        </Button>
    ) : (
        <Button type="submit" form="confirm-form" size="lg" className="w-full" disabled={!canContinue}>
            {isSubmitting ? "Holding your slot…" : "Continue to payment"}
        </Button>
    );

    if (expired) {
        return (
            <Card className="space-y-4" role="alert">
                <h2 className="text-lg font-bold">Your hold has expired</h2>
                <p className="text-sm">The slot was released. Your filters are kept, so you can pick again.</p>
                <Button size="lg" onClick={onPickAgain}>
                    Pick again
                </Button>
            </Card>
        );
    }

    return (
        <div className="space-y-5">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal"
            >
                <ArrowLeft size={16} aria-hidden /> Back to slots
            </button>

            {/* Summary shows here on phones/tablets; on large screens it lives in the sticky sidebar. */}
            <div className="lg:hidden">
                <SummaryCard info={info} amounts={amounts} loading={loading} advancePercent={advancePercent} />
            </div>

            {!user && (
                <Card className="space-y-3">
                    <h2 className="text-lg font-bold">Sign in to pay</h2>
                    <p className="text-sm text-evergreen/80">Your selection is saved. Sign in or create an account to continue.</p>
                    <AuthForm onSuccess={onAuthed} />
                </Card>
            )}

            {hold ? (
                <Card className="space-y-4">
                    <h2 className="text-lg font-bold">Pay the advance</h2>
                    <HoldCountdown expiresAt={hold.holdExpiresAt} serverNow={hold.serverNow} onExpire={() => setExpired(true)} />
                    <p className="text-sm">
                        Pay <strong>{formatBDT(hold.advanceAmount)}</strong> with bKash to confirm. The remaining{" "}
                        <strong>{formatBDT(hold.balanceAmount)}</strong> is paid in cash at the venue. Your slot is confirmed only
                        after we verify the payment with bKash.
                    </p>
                    <div className="hidden lg:block">{primary}</div>
                    {payError && (
                        <p role="alert" className="flex items-start gap-2 rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /> {payError}
                        </p>
                    )}
                </Card>
            ) : (
                <form id="confirm-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                    <Card className="space-y-4">
                        <h2 className="text-lg font-bold">Contact</h2>
                        <Input
                            label="Mobile number"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="01XXXXXXXXX"
                            hint="We use this to reach you about your booking."
                            error={errors.phone?.message}
                            {...register("phone")}
                        />
                    </Card>

                    <Card className="space-y-3">
                        <h2 className="text-lg font-bold">Cancellation & refunds</h2>
                        {cancellationSummary.map((line) => (
                            <p key={line} className="text-sm text-evergreen/85">{line}</p>
                        ))}
                        <p className="text-sm">
                            <Link href="/legal#refund" target="_blank" className="font-semibold text-teal underline underline-offset-2">
                                Read the full policy
                            </Link>
                        </p>
                        <label className="flex min-h-11 items-start gap-3 text-sm font-medium">
                            <input type="checkbox" className="mt-1 size-5 accent-teal" {...register("acceptPolicy")} />
                            <span>I have read and accept the cancellation and refund policy.</span>
                        </label>
                        {errors.acceptPolicy && (
                            <p role="alert" className="text-sm font-medium text-booked">{errors.acceptPolicy.message}</p>
                        )}
                    </Card>

                    {formError && (
                        <p role="alert" className="flex items-start gap-2 rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /> {formError}
                        </p>
                    )}
                    <div className="hidden lg:block">{primary}</div>
                </form>
            )}

            {/* Phone action bar: primary action in the thumb zone */}
            <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-evergreen/10 bg-white lg:hidden">
                <div className="mx-auto max-w-xl p-3">{primary}</div>
            </div>
        </div>
    );
}