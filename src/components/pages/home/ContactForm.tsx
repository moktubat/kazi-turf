"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, AlertTriangle, User, Mail, Phone, Trophy, FileText } from "lucide-react";
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
            <div className="space-y-3">
                <h3 className="font-heading text-3xl font-bold md:text-4xl">Send Us a Message</h3>
                <p className="max-w-md text-evergreen/80">
                    Fill out the form and our team will get back to you within 24 hours.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Input
                    label="First name"
                    icon={User}
                    placeholder="Enter first name"
                    autoComplete="given-name"
                    error={errors.firstName?.message}
                    {...register("firstName")}
                />
                <Input
                    label="Last name"
                    icon={User}
                    placeholder="Enter last name"
                    autoComplete="family-name"
                    error={errors.lastName?.message}
                    {...register("lastName")}
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Input
                    label="Email"
                    icon={Mail}
                    type="email"
                    placeholder="Enter email"
                    autoComplete="email"
                    error={errors.email?.message}
                    {...register("email")}
                />
                <Input
                    label="Phone"
                    icon={Phone}
                    type="tel"
                    inputMode="tel"
                    placeholder="Enter phone"
                    autoComplete="tel"
                    error={errors.phone?.message}
                    {...register("phone")}
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Sport" icon={Trophy} error={errors.sport?.message} {...register("sport")}>
                    {sports.length === 0 && <option value="">No sports yet</option>}
                    {sports.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </Select>
                <Input
                    label="Subject"
                    icon={FileText}
                    placeholder="Enter subject"
                    error={errors.subject?.message}
                    {...register("subject")}
                />
            </div>

            <Textarea
                label="Message"
                rows={5}
                placeholder="Type here . . ."
                className="resize-none"
                error={errors.message?.message}
                {...register("message")}
            />

            {/* Honeypot */}
            <div aria-hidden className="absolute -left-[9999px]">
                <label>
                    Website
                    <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
                </label>
            </div>

            <Button
                type="submit"
                size="lg"
                className="w-fit bg-evergreen px-8 text-white hover:bg-pitch"
                disabled={isSubmitting}
            >
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