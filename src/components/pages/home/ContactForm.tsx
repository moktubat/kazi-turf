"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, AlertTriangle, Send } from "lucide-react";
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
            className="relative space-y-4 rounded-2xl border border-evergreen/10 bg-white p-5 shadow-lg md:p-6"
            aria-label="Send us a message"
        >
            <div>
                <h3 className="text-lg font-bold">Send a message</h3>
                <p className="text-sm text-evergreen/70">We usually reply the same day.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Name" autoComplete="name" error={errors.name?.message} {...register("name")} />
                <Input
                    label="Phone or email"
                    autoComplete="email"
                    error={errors.contact?.message}
                    {...register("contact")}
                />
            </div>
            <Textarea label="Message" rows={4} error={errors.message?.message} {...register("message")} />

            {/* Honeypot: hidden from people and assistive tech */}
            <div aria-hidden className="absolute -left-[9999px]">
                <label>
                    Website
                    <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
                </label>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                <Send size={18} aria-hidden /> {isSubmitting ? "Sending…" : "Send message"}
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