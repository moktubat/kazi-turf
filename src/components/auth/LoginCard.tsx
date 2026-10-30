"use client";
import { useRouter } from "next/navigation";
import { AuthForm } from "./AuthForm";

export function LoginCard({
    next,
    initialMode,
}: {
    next: string | null;
    initialMode: "signin" | "signup";
}) {
    const router = useRouter();
    return (
        <AuthForm
            initialMode={initialMode}
            onSuccess={() => {
                router.replace(next ?? "/account");
                router.refresh();
            }}
        />
    );
}