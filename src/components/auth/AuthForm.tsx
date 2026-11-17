// One form, reused inline in /book step 2 and on /login (Batch 4).
// Posts to /api/auth/login, /api/auth/register/code (emails a code) and /api/auth/register.
// Forgot password: posts to /api/auth/forgot-password (emails a reset link) and,
// when the link opens /login?reset=…, to /api/auth/reset-password.
"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Tabs";
import { useCountdown } from "@/hooks/useCountdown";
import { ApiError, api } from "@/lib/api";
import { loginSchema, registerDetailsSchema, type LoginInput, type RegisterDetailsInput } from "@/schemas/auth";
import { customerPasswordSchema } from "@/schemas/password";

type Mode = "signin" | "signup";
/** Which card is open: the login/register tabs, the forgot form, or the reset-link form. */
type View = "auth" | "forgot" | "reset";

export function AuthForm({
    onSuccess,
    initialMode = "signin",
    initialResetToken = null,
}: {
    onSuccess: () => void;
    initialMode?: Mode;
    /** Token from a reset email link (/login?reset=…); opens the set-new-password card. */
    initialResetToken?: string | null;
}) {
    const [mode, setMode] = useState<Mode>(initialMode);
    const [view, setView] = useState<View>(initialResetToken ? "reset" : "auth");

    return (
        <div>
            {view === "auth" && (
                <Tabs
                    label="Account"
                    items={[
                        { id: "signin", label: "Login" },
                        { id: "signup", label: "Register" },
                    ]}
                    value={mode}
                    onChange={(m) => setMode(m as Mode)}
                />
            )}
            <div className="mt-4">
                {view === "auth" && (
                    <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}>
                        {mode === "signin" ? (
                            <SignIn onSuccess={onSuccess} onForgot={() => setView("forgot")} />
                        ) : (
                            <SignUp onSuccess={onSuccess} />
                        )}
                    </div>
                )}
                {view === "forgot" && <ForgotPassword onDone={() => setView("auth")} />}
                {view === "reset" && initialResetToken && (
                    <ResetPassword token={initialResetToken} onDone={() => setView("auth")} />
                )}
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

function SignIn({ onSuccess, onForgot }: { onSuccess: () => void; onForgot: () => void }) {
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
            <button
                type="button"
                onClick={onForgot}
                className="block w-fit text-sm font-semibold text-teal underline underline-offset-2 hover:text-evergreen"
            >
                Forgot password?
            </button>
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

const forgotSchema = z.object({
    identifier: z.string().trim().min(3, "Enter your email or phone").max(120, "Too long"),
});

/** Ask for a reset email. The confirmation never says whether the account exists. */
function ForgotPassword({ onDone }: { onDone: () => void }) {
    const [formError, setFormError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<z.infer<typeof forgotSchema>>({
        resolver: zodResolver(forgotSchema),
        defaultValues: { identifier: "" },
    });

    async function onSubmit(values: z.infer<typeof forgotSchema>) {
        setFormError(null);
        try {
            await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify(values) });
            setSent(true);
        } catch (e) {
            setFormError(e instanceof ApiError ? e.message : "Could not send the reset email. Please try again.");
        }
    }

    if (sent) {
        return (
            <div className="space-y-4" aria-label="Check your email">
                <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
                    <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" />
                    If an account exists for that email or phone, a reset link is on its way. It expires in 15
                    minutes — check the spam folder too.
                </p>
                <Button type="button" variant="ghost" className="w-full" onClick={onDone}>
                    Back to sign in
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Forgot password">
            <p className="text-sm text-evergreen/80">
                Enter the email or phone on your account and we&apos;ll email you a link to set a new password.
            </p>
            <Input
                label="Email or phone"
                autoComplete="username"
                error={errors.identifier?.message}
                {...register("identifier")}
            />
            <FormError message={formError} />
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={onDone}>
                Back to sign in
            </Button>
        </form>
    );
}

const resetSchema = z.object({ newPassword: customerPasswordSchema });

/** Set a new password from an emailed reset link (/login?reset=token). */
function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
    const [formError, setFormError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<z.infer<typeof resetSchema>>({
        resolver: zodResolver(resetSchema),
        defaultValues: { newPassword: "" },
    });

    async function onSubmit(values: z.infer<typeof resetSchema>) {
        setFormError(null);
        try {
            await api("/api/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({ token, newPassword: values.newPassword }),
            });
            setDone(true);
        } catch (e) {
            // A field problem (weak password) keeps the form open so the link is
            // not wasted; an invalid or expired link is fatal — say so plainly.
            if (e instanceof ApiError && e.fields?.newPassword) {
                setError("newPassword", { message: e.fields.newPassword });
            } else {
                setFormError(e instanceof ApiError ? e.message : "Could not reset the password. Please try again.");
            }
        }
    }

    if (done) {
        return (
            <div className="space-y-4" aria-label="Password updated">
                <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
                    <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" />
                    Your password is updated. Sign in with the new password — your other sessions were signed out.
                </p>
                <Button type="button" className="w-full" onClick={onDone}>
                    Go to sign in
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Set a new password">
            <p className="text-sm text-evergreen/80">Choose a new password for your account.</p>
            <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                hint="At least 8 characters, with letters and digits."
                error={errors.newPassword?.message}
                {...register("newPassword")}
            />
            <FormError message={formError} />
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save new password"}
            </Button>
        </form>
    );
}