"use client";
import { useRouter } from "next/navigation";
import { AuthForm } from "./AuthForm";

export function LoginCard({
    next,
    initialMode,
    resetToken,
}: {
    next: string | null;
    initialMode: "signin" | "signup";
    /** Token from a reset email link (/login?reset=…); opens the set-new-password card. */
    resetToken?: string | null;
}) {
    const router = useRouter();
    return (
        <AuthForm
            initialMode={initialMode}
            initialResetToken={resetToken ?? null}
            onSuccess={() => {
                router.replace(next ?? "/account");
                router.refresh();
            }}
        />
    );
}