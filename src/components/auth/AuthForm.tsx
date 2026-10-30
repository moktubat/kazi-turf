// One form, reused inline in /book step 2 and on /login (Batch 4).
// Posts to /api/auth/login and /api/auth/register (Batch 4).
"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Tabs";
import { ApiError, api } from "@/lib/api";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@/schemas/auth";

type Mode = "signin" | "signup";

export function AuthForm({
    onSuccess,
    initialMode = "signin",
}: {
    onSuccess: () => void;
    initialMode?: Mode;
}) {
    const [mode, setMode] = useState<Mode>(initialMode);

    return (
        <div>
            <Tabs
                label="Account"
                items={[
                    { id: "signin", label: "Sign in" },
                    { id: "signup", label: "Create account" },
                ]}
                value={mode}
                onChange={(m) => setMode(m as Mode)}
            />
            <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`} className="mt-4">
                {mode === "signin" ? <SignIn onSuccess={onSuccess} /> : <SignUp onSuccess={onSuccess} />}
            </div>
        </div>
    );
}

function FormError({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <p role="alert" className="rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
            {message}
        </p>
    );
}

function SignIn({ onSuccess }: { onSuccess: () => void }) {
    const [formError, setFormError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginInput>({
        resolver: zodResolver(loginSchema),
        defaultValues: { identifier: "", password: "" },
    });

    async function onSubmit(values: LoginInput) {
        setFormError(null);
        try {
            await api("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
            onSuccess();
        } catch (e) {
            // Generic message on purpose: never reveal which field was wrong.
            setFormError(e instanceof ApiError ? e.message : "Could not sign in. Please try again.");
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Sign in">
            <Input
                label="Email or phone"
                autoComplete="username"
                error={errors.identifier?.message}
                {...register("identifier")}
            />
            <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register("password")}
            />
            <FormError message={formError} />
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
        </form>
    );
}

function SignUp({ onSuccess }: { onSuccess: () => void }) {
    const [formError, setFormError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<RegisterInput>({
        resolver: zodResolver(registerSchema),
        defaultValues: { name: "", phone: "", email: "", password: "" },
    });

    async function onSubmit(values: RegisterInput) {
        setFormError(null);
        try {
            await api("/api/auth/register", { method: "POST", body: JSON.stringify(values) });
            onSuccess();
        } catch (e) {
            if (e instanceof ApiError) {
                if (e.fields) {
                    for (const [k, v] of Object.entries(e.fields)) setError(k as keyof RegisterInput, { message: v });
                }
                setFormError(e.message);
            } else {
                setFormError("Could not create your account. Please try again.");
            }
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Create account">
            <Input label="Name" autoComplete="name" error={errors.name?.message} {...register("name")} />
            <Input
                label="Phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                error={errors.phone?.message}
                {...register("phone")}
            />
            <Input
                label="Email (optional)"
                type="email"
                autoComplete="email"
                error={errors.email?.message}
                {...register("email")}
            />
            <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                hint="At least 8 characters."
                error={errors.password?.message}
                {...register("password")}
            />
            <FormError message={formError} />
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
        </form>
    );
}