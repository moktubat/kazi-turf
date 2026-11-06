"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { contactSchema, type ContactInput } from "@/schemas/contact";

type Status = "idle" | "success" | "error";

export function ContactForm() {
    const [status, setStatus] = useState<Status>("idle");
    const [serverMsg, setServerMsg] = useState("");

    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<ContactInput>({
        resolver: zodResolver(contactSchema),
        defaultValues: { name: "", contact: "", message: "", website: "" },
    });

    async function onSubmit(values: ContactInput) {
        setStatus("idle");
        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            if (res.ok) {
                reset();
                setStatus("success");
                return;
            }

            const err = (await res.json().catch(() => null)) as {
                message?: string;
                fields?: Record<string, string>;
            } | null;

            if (err?.fields) {
                for (const [k, v] of Object.entries(err.fields)) {
                    setError(k as keyof ContactInput, { message: v });
                }
            }
            setServerMsg(err?.message ?? "We could not send your message. Please try again.");
            setStatus("error");
        } catch {
            setServerMsg("Network problem. Check your connection and try again.");
            setStatus("error");
        }
    }

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="relative space-y-5"
            aria-label="Send us a message"
        >
            <div className="grid gap-5 sm:grid-cols-2">
                <Input label="Name" autoComplete="name" error={errors.name?.message} {...register("name")} />
                <Input
                    label="Phone or email"
                    autoComplete="email"
                    error={errors.contact?.message}
                    {...register("contact")}
                />
            </div>

            <Textarea
                label="Message"
                rows={7}
                placeholder="Tell us what we can help you with"
                error={errors.message?.message}
                {...register("message")}
            />

            {/* Honeypot: hidden from people and assistive tech */}
            <div aria-hidden className="absolute -left-[9999px]">
                <label>
                    Website
                    <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
                </label>
            </div>

            <p className="text-sm text-evergreen/80">
                By sending this message you agree to our{" "}
                <Link href="/legal#privacy" className="font-semibold text-teal underline underline-offset-2">
                    Privacy Policy
                </Link>
                . We usually reply the same day.
            </p>

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Sending…" : "Send message"}
            </Button>

            {status === "success" && (
                <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
                    <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" />
                    Thanks. We received your message and will get back to you.
                </p>
            )}
            {status === "error" && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-booked-soft p-3 text-sm font-medium text-booked">
                    <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
                    {serverMsg}
                </p>
            )}
        </form>
    );
}