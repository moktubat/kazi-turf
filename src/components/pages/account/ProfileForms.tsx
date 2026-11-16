"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, KeyRound, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { useCountdown } from "@/hooks/useCountdown";
import { ApiError, api } from "@/lib/api";
import { passwordSchema, profileSchema, type PasswordInput, type ProfileInput } from "@/schemas/account";

function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }) {
    return ok ? (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
            <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" /> {children}
        </p>
    ) : (
        <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">{children}</p>
    );
}

function SectionHeader({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3 border-b border-evergreen/10 pb-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-mint text-teal">
                <Icon size={18} aria-hidden />
            </span>
            <div className="min-w-0">
                <h2 className="font-heading text-base font-bold leading-tight">{title}</h2>
                <p className="mt-0.5 text-xs text-evergreen/70">{description}</p>
            </div>
        </div>
    );
}

export interface ProfileView {
    name: string;
    phone: string;
    email: string;
    emailVerified?: boolean;
    /** Customers confirm a new email with a code; staff accounts keep the direct update. */
    verifyEmail?: boolean;
}

type Pending = { email: string; sentTo: string; expiresInMinutes: number; resendInSeconds: number };

export function ProfileForms({ profile }: { profile: ProfileView }) {
    return (
        <div className="grid gap-5 lg:grid-cols-2">
            <ProfileForm profile={profile} />
            <PasswordForm />
        </div>
    );
}

function ProfileForm({ profile }: { profile: ProfileView }) {
    const router = useRouter();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    const [sending, setSending] = useState(false);
    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<ProfileInput>({
        resolver: zodResolver(profileSchema),
        defaultValues: { name: profile.name, phone: profile.phone, email: profile.email },
    });

    const emailHint = !profile.verifyEmail || !profile.email ? undefined : profile.emailVerified ? "Verified" : "Not verified yet";

    async function onSubmit(v: ProfileInput) {
        setMsg(null);
        try {
            const r = await api<{ profile: { emailPending?: Pending } }>("/api/account/profile", { method: "PATCH", body: JSON.stringify(v) });
            if (r.profile.emailPending) {
                setPending(r.profile.emailPending);
                setMsg({
                    ok: true,
                    text: `Saved. Enter the code we sent to ${r.profile.emailPending.sentTo} to switch to the new email. Until then your account keeps ${profile.email || "no email"}.`,
                });
            } else {
                setPending(null);
                setMsg({ ok: true, text: "Profile saved." });
            }
            router.refresh();
        } catch (e) {
            if (e instanceof ApiError) {
                if (e.fields) for (const [k, m] of Object.entries(e.fields)) setError(k as keyof ProfileInput, { message: m });
                setMsg({ ok: false, text: e.message });
            } else setMsg({ ok: false, text: "Could not save. Please try again." });
        }
    }

    return (
        <Card>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Profile">
                <SectionHeader
                    icon={UserRound}
                    title="Profile"
                    description="Update the name and contact details attached to your account."
                />
                <Input label="Name" autoComplete="name" error={errors.name?.message} {...register("name")} />
                <Input label="Phone" type="tel" inputMode="tel" autoComplete="tel" error={errors.phone?.message} {...register("phone")} />
                <Input label="Email (optional)" type="email" autoComplete="email" hint={emailHint} error={errors.email?.message} {...register("email")} />
                {profile.verifyEmail && profile.email && !profile.emailVerified && !pending && (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={sending}
                        onClick={async () => {
                            setMsg(null);
                            setSending(true);
                            try {
                                setPending(await api<Pending>("/api/account/email/code", { method: "POST", body: JSON.stringify({ email: profile.email }) }));
                            } catch (e) {
                                setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not send the code. Please try again." });
                            } finally {
                                setSending(false);
                            }
                        }}
                    >
                        {sending ? "Sending code…" : "Verify this email"}
                    </Button>
                )}
                {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
                <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? "Saving…" : "Save profile"}
                </Button>
            </form>
            {pending && (
                <EmailCodeForm
                    key={pending.email}
                    pending={pending}
                    onResent={setPending}
                    onCancel={() => {
                        setPending(null);
                        setMsg(null);
                    }}
                    onVerified={() => {
                        setPending(null);
                        setMsg({ ok: true, text: "Email verified." });
                        router.refresh();
                    }}
                />
            )}
        </Card>
    );
}

/** Customer: confirm the emailed code. Only then does the account email change (server side). */
function EmailCodeForm({
    pending,
    onResent,
    onCancel,
    onVerified,
}: {
    pending: Pending;
    onResent: (p: Pending) => void;
    onCancel: () => void;
    onVerified: () => void;
}) {
    const [code, setCode] = useState("");
    const [error, setErrorText] = useState<string | null>(null);
    const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
    const [secondsLeft, startCountdown] = useCountdown(pending.resendInSeconds); // the form opens right after a send

    async function verify(e: React.FormEvent) {
        e.preventDefault();
        if (!/^\d{6}$/.test(code)) return setErrorText("Enter the 6-digit code from your email");
        setErrorText(null);
        setBusy("verify");
        try {
            await api("/api/account/email/verify", { method: "POST", body: JSON.stringify({ email: pending.email, otpCode: code }) });
            onVerified();
        } catch (err) {
            setErrorText(err instanceof ApiError ? (err.fields?.otpCode ?? err.fields?.email ?? err.message) : "Could not verify. Please try again.");
        } finally {
            setBusy(null);
        }
    }

    async function resend() {
        setErrorText(null);
        setBusy("resend");
        try {
            const p = await api<Pending>("/api/account/email/code", { method: "POST", body: JSON.stringify({ email: pending.email }) });
            setCode("");
            startCountdown(p.resendInSeconds);
            onResent(p);
        } catch (err) {
            setErrorText(err instanceof ApiError ? err.message : "Could not send the code. Please try again.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <form onSubmit={verify} noValidate className="mt-4 space-y-3 border-t border-evergreen/10 pt-4" aria-label="Confirm new email">
            <p className="text-sm text-evergreen/80">
                Code sent to <strong className="font-semibold text-evergreen">{pending.sentTo}</strong>. It expires in {pending.expiresInMinutes} minutes.
            </p>
            <Input
                label="Verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                hint="Not in your inbox? Check the spam folder."
                error={error ?? undefined}
            />
            <Button type="submit" className="w-full" disabled={busy !== null}>
                {busy === "verify" ? "Confirming…" : "Confirm email"}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={resend} disabled={busy !== null || secondsLeft > 0}>
                    {busy === "resend" ? "Sending…" : secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel} disabled={busy !== null}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

function PasswordForm() {
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<PasswordInput>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { currentPassword: "", newPassword: "" },
    });

    async function onSubmit(v: PasswordInput) {
        setMsg(null);
        try {
            await api("/api/account/password", { method: "POST", body: JSON.stringify(v) });
            reset();
            setMsg({ ok: true, text: "Password changed. Other devices were signed out." });
        } catch (e) {
            if (e instanceof ApiError) {
                if (e.fields) for (const [k, m] of Object.entries(e.fields)) setError(k as keyof PasswordInput, { message: m });
                setMsg({ ok: false, text: e.message });
            } else setMsg({ ok: false, text: "Could not change the password. Please try again." });
        }
    }

    return (
        <Card>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Change password">
                <SectionHeader
                    icon={KeyRound}
                    title="Change password"
                    description="Use at least 8 characters. Changing it signs out every other device."
                />
                <Input
                    label="Current password"
                    type="password"
                    autoComplete="current-password"
                    error={errors.currentPassword?.message}
                    {...register("currentPassword")}
                />
                <Input
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    hint="At least 8 characters."
                    error={errors.newPassword?.message}
                    {...register("newPassword")}
                />
                {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
                <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? "Updating…" : "Change password"}
                </Button>
            </form>
        </Card>
    );
}