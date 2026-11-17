// One form, reused inline in /book step 2 and on /login (Batch 4).
// Posts to /api/auth/login, /api/auth/register/code (emails a code) and /api/auth/register.
"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Tabs";
import { useCountdown } from "@/hooks/useCountdown";
import { ApiError, api } from "@/lib/api";
import { loginSchema, registerDetailsSchema, type LoginInput, type RegisterDetailsInput } from "@/schemas/auth";

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
                    { id: "signin", label: "Login" },
                    { id: "signup", label: "Register" },
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

type CodeSent = { sentTo: string; expiresInMinutes: number; resendInSeconds: number };
const DETAIL_FIELDS = ["name", "phone", "email", "password"] as const;

// Two steps in the same card: 1) details, then a 6-digit code is emailed; 2) enter the code.
function SignUp({ onSuccess }: { onSuccess: () => void }) {
    const [formError, setFormError] = useState<string | null>(null);
    const [sent, setSent] = useState<CodeSent | null>(null); // set = step 2
    const [details, setDetails] = useState<RegisterDetailsInput | null>(null);
    const [code, setCode] = useState("");
    const [codeError, setCodeError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
    const [secondsLeft, startCountdown] = useCountdown();
    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<RegisterDetailsInput>({
        resolver: zodResolver(registerDetailsSchema),
        defaultValues: { name: "", phone: "", email: "", password: "" },
    });

    /** Server field errors: a details problem goes back to step 1, a code problem stays on step 2. */
    function showServerError(e: ApiError) {
        const detailErrors = Object.entries(e.fields ?? {}).filter(([k]) => (DETAIL_FIELDS as readonly string[]).includes(k));
        if (detailErrors.length > 0) {
            setSent(null);
            for (const [k, v] of detailErrors) setError(k as keyof RegisterDetailsInput, { message: v });
        }
        if (e.fields?.otpCode) setCodeError(e.fields.otpCode);
        else setFormError(e.message);
    }

    function codeWasSent(r: CodeSent) {
        setSent(r);
        startCountdown(r.resendInSeconds);
    }

    async function sendCode(values: RegisterDetailsInput) {
        setFormError(null);
        try {
            const r = await api<CodeSent>("/api/auth/register/code", { method: "POST", body: JSON.stringify(values) });
            setDetails(values);
            setCode("");
            setCodeError(null);
            setNotice(null);
            codeWasSent(r);
        } catch (e) {
            if (e instanceof ApiError) showServerError(e);
            else setFormError("Could not send the code. Please try again.");
        }
    }

    async function resend() {
        if (!details) return;
        setBusy("resend");
        setFormError(null);
        setCodeError(null);
        setNotice(null);
        try {
            codeWasSent(await api<CodeSent>("/api/auth/register/code", { method: "POST", body: JSON.stringify({ ...details, resend: true }) }));
            setCode("");
            setNotice("A new code is on its way. Earlier codes no longer work.");
        } catch (e) {
            if (e instanceof ApiError) showServerError(e);
            else setFormError("Could not send the code. Please try again.");
        } finally {
            setBusy(null);
        }
    }

    async function verify(e: React.FormEvent) {
        e.preventDefault();
        if (!details) return;
        setFormError(null);
        setNotice(null);
        if (!/^\d{6}$/.test(code)) {
            setCodeError("Enter the 6-digit code from your email");
            return;
        }
        setCodeError(null);
        setBusy("verify");
        try {
            await api("/api/auth/register", { method: "POST", body: JSON.stringify({ ...details, otpCode: code }) });
            onSuccess();
        } catch (err) {
            if (err instanceof ApiError) showServerError(err);
            else setFormError("Could not create your account. Please try again.");
        } finally {
            setBusy(null);
        }
    }

    if (sent) {
        return (
            <form onSubmit={verify} noValidate className="space-y-4" aria-label="Verify your email">
                <p className="text-sm text-evergreen/80">
                    We sent a 6-digit code to <strong className="font-semibold text-evergreen [overflow-wrap:anywhere]">{sent.sentTo}</strong>. It expires in{" "}
                    {sent.expiresInMinutes} minutes.
                </p>
                <Input
                    label="Verification code"
                    inputMode="numeric"
                    autoFocus
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                    hint="Not in your inbox? Check the spam folder."
                    error={codeError ?? undefined}
                />
                {notice && (
                    <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
                        <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" /> {notice}
                    </p>
                )}
                <FormError message={formError} />
                <Button type="submit" size="lg" className="w-full" disabled={busy !== null}>
                    {busy === "verify" ? "Creating account…" : "Create account"}
                </Button>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button type="button" variant="ghost" onClick={resend} disabled={busy !== null || secondsLeft > 0}>
                        {busy === "resend" ? "Sending…" : secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => {
                            setSent(null);
                            setFormError(null);
                        }}
                    >
                        Change details
                    </Button>
                </div>
            </form>
        );
    }

    return (
        <form onSubmit={handleSubmit(sendCode)} noValidate className="space-y-4" aria-label="Create account">
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
                label="Email"
                type="email"
                autoComplete="email"
                hint="We'll email you a 6-digit code to confirm it."
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
                {isSubmitting ? "Sending code…" : "Send verification code"}
            </Button>
        </form>
    );
}
