import { MapPin, Phone, Mail, Clock, MessageCircle } from "lucide-react";
import { site } from "@/data/site";
import { formatHourRange } from "@/lib/format";
import { Section } from "./Section";
import { ContactForm } from "./ContactForm";
import type { Branch } from "@/types";

interface InfoRow {
    icon: React.ElementType;
    label: string;
    value: string;
    href?: string;
    external?: boolean;
}

export function ContactSection({ venue }: { venue: Branch }) {
    if (venue.status !== "ACTIVE") return null;

    const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(venue.address)}&output=embed`;

    const rows: InfoRow[] = [
        { icon: Phone, label: "Call us", value: venue.phone, href: `tel:${venue.phone}` },
        { icon: Mail, label: "Email us", value: site.email, href: `mailto:${site.email}` },
        { icon: MapPin, label: "Visit us", value: venue.address, href: venue.mapUrl, external: true },
        { icon: MessageCircle, label: "WhatsApp", value: "Chat with us", href: `https://wa.me/${venue.whatsapp}`, external: true },
        { icon: Clock, label: "Open hours", value: formatHourRange(venue.hours) || venue.hours },
    ];

    return (
        <Section id="contact" eyebrow="Get in touch" title="Contact us" tone="canvas">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
                {/* Left: Contact information card (evergreen gradient) */}
                <div className="flex flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-evergreen via-evergreen to-teal shadow-lift">
                    <div className="space-y-8 p-7 lg:p-9">
                        <div className="space-y-2">
                            <h3 className="font-heading text-2xl font-extrabold text-white sm:text-3xl">
                                Contact information
                            </h3>
                            <p className="max-w-md text-sm text-white/75">
                                Reach out — we help you find your slot, reduce friction, and keep your game moving.
                                We usually reply the same day.
                            </p>
                        </div>

                        <ul className="space-y-3">
                            {rows.map((r) => {
                                const Icon = r.icon;
                                const content = (
                                    <>
                                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface/15 text-emerald">
                                            <Icon size={20} aria-hidden />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-xs font-semibold uppercase tracking-wide text-white/60">
                                                {r.label}
                                            </span>
                                            <span className="block break-words text-sm font-semibold text-white">
                                                {r.value}
                                            </span>
                                        </span>
                                    </>
                                );
                                return (
                                    <li key={r.label}>
                                        {r.href ? (
                                            <a
                                                href={r.href}
                                                {...(r.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                                className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-surface/10"
                                            >
                                                {content}
                                            </a>
                                        ) : (
                                            <div className="flex items-center gap-3 p-1">{content}</div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Google Map iframe embed (no API key needed) */}
                    <div className="mt-auto aspect-[4/3] w-full border-t border-white/10 bg-evergreen/40">
                        <iframe
                            src={mapSrc}
                            title={`Map showing ${venue.address}`}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            className="h-full w-full"
                            style={{ border: 0, filter: "saturate(0.9) brightness(0.95)" }}
                            allowFullScreen
                        />
                    </div>
                </div>

                {/* Right: Send us a message form (white surface card) */}
                <div className="rounded-3xl border border-evergreen/10 bg-surface p-7 shadow-sm lg:p-9">
                    <ContactForm sports={venue.sports} />
                </div>
            </div>
        </Section>
    );
}