"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
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

export function ProfileForms({ profile }: { profile: { name: string; phone: string; email: string } }) {
    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <ProfileForm profile={profile} />
            <PasswordForm />
        </div>
    );
}

function ProfileForm({ profile }: { profile: { name: string; phone: string; email: string } }) {
    const router = useRouter();
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: profile });

    async function onSubmit(v: ProfileInput) {
        setMsg(null);
        try {
            await api("/api/account/profile", { method: "PATCH", body: JSON.stringify(v) });
            setMsg({ ok: true, text: "Profile saved." });
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
                <h2 className="text-lg font-bold">Profile</h2>
                <Input label="Name" autoComplete="name" error={errors.name?.message} {...register("name")} />
                <Input label="Phone" type="tel" inputMode="tel" autoComplete="tel" error={errors.phone?.message} {...register("phone")} />
                <Input label="Email (optional)" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
                {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
                <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? "Saving…" : "Save profile"}
                </Button>
            </form>
        </Card>
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
                <h2 className="text-lg font-bold">Change password</h2>
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