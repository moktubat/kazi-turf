"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { contactSchema, type ContactInput } from "@/schemas/contact";

type Status = "idle" | "success" | "error";

export function ContactForm({ sports }: { sports: string[] }) {
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
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            sport: sports[0] ?? "",
            subject: "",
            message: "",
            website: "",
        },
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
                reset({ ...values, subject: "", message: "" });
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
            <div className="space-y-1">
                <h3 className="font-heading text-2xl font-extrabold text-evergreen sm:text-3xl">
                    Send Us a Message
                </h3>
                <p className="text-sm text-evergreen/70">
                    Fill out the form below and our team will get back to you within 24 hours.
                </p>
            </div>

            {/* First name + Last name */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Input
                    label="First name"
                    autoComplete="given-name"
                    error={errors.firstName?.message}
                    {...register("firstName")}
                />
                <Input
                    label="Last name"
                    autoComplete="family-name"
                    error={errors.lastName?.message}
                    {...register("lastName")}
                />
            </div>

            {/* Email + Phone */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Input
                    label="Email"
                    type="email"
                    autoComplete="email"
                    error={errors.email?.message}
                    {...register("email")}
                />
                <Input
                    label="Phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="01XXXXXXXXX"
                    error={errors.phone?.message}
                    {...register("phone")}
                />
            </div>

            {/* Sport + Subject */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Select
                    label="Sport"
                    error={errors.sport?.message}
                    {...register("sport")}
                >
                    {sports.length === 0 && <option value="">No sports yet</option>}
                    {sports.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </Select>
                <Input
                    label="Subject"
                    placeholder="What is this about?"
                    error={errors.subject?.message}
                    {...register("subject")}
                />
            </div>

            {/* Message */}
            <Textarea
                label="Message"
                rows={5}
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
                {isSubmitting ? "Sending…" : "Send Message"}
            </Button>

            {status === "success" && (
                <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald/20 p-3 text-sm font-medium">
                    <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-teal" />
                    Thanks. We received your message and will get back to you within 24 hours.
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