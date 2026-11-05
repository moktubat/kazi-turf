import { Clock, MapPin, MessageCircle, Phone, ArrowUpRight } from "lucide-react";
import { venue } from "@/data/branches";
import { formatHourRange } from "@/lib/format";
import { Section } from "./Section";
import { ContactForm } from "./ContactForm";

function Row({
    icon: Icon,
    label,
    value,
    href,
    external,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    href?: string;
    external?: boolean;
}) {
    const body = (
        <>
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald text-evergreen">
                <Icon size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wide text-white/60">{label}</span>
                <span className="block break-words font-semibold text-white">{value}</span>
            </span>
            {href && <ArrowUpRight size={18} aria-hidden className="shrink-0 text-white/50" />}
        </>
    );
    const cls = "flex min-h-16 items-center gap-3 rounded-2xl p-3";
    return href ? (
        <a
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={`${cls} transition-colors hover:bg-white/10`}
        >
            {body}
        </a>
    ) : (
        <div className={cls}>{body}</div>
    );
}

export function ContactSection() {
    if (venue.status !== "ACTIVE") return null;

    return (
        <Section
            id="contact"
            eyebrow="Get in touch"
            title="Contact us"
            intro="Questions about a booking or the venue? Reach us directly or send a message."
        >
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
                <div className="rounded-2xl bg-evergreen p-3 shadow-lg md:p-4">
                    <Row icon={MapPin} label="Address" value={venue.address} href={venue.mapUrl} external />
                    <Row icon={Clock} label="Open" value={formatHourRange(venue.hours)} />
                    <Row icon={Phone} label="Call" value={venue.phone} href={`tel:${venue.phone}`} />
                    <Row
                        icon={MessageCircle}
                        label="WhatsApp"
                        value="Chat with us"
                        href={`https://wa.me/${venue.whatsapp}`}
                        external
                    />
                </div>

                <ContactForm />
            </div>
        </Section>
    );
}