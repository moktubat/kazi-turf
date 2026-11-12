import { MapPin, PhoneCall, Mail, Clock } from "lucide-react";
import { site } from "@/data/site";
import { formatHourRange } from "@/lib/format";
import { Reveal } from "./Reveal";
import { ContactForm } from "./ContactForm";
import type { Branch } from "@/types";
import { Section } from "./Section";

interface InfoRow {
    icon: React.ElementType;
    value: string;
    href?: string;
    external?: boolean;
}

export function ContactSection({ venue }: { venue: Branch }) {
    if (venue.status !== "ACTIVE") return null;

    const mapSrc =
        "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4331.84194305314!2d89.4043791!3d24.861072900000003!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39fdab001d0eb5ef%3A0xb04f404788543c27!2sKAZI%20SPORTS%20ARENA!5e1!3m2!1sen!2sbd!4v1794468987101!5m2!1sen!2sbd";

    const rows: InfoRow[] = [
        { icon: PhoneCall, value: venue.phone, href: `tel:${venue.phone}` },
        { icon: Mail, value: site.email, href: `mailto:${site.email}` },
        { icon: MapPin, value: venue.address, href: venue.mapUrl, external: true },
        { icon: Clock, value: formatHourRange(venue.hours) || venue.hours },
    ];

    return (

        <Section id="contact" eyebrow="Get in touch" title="Contact us" tone="canvas">
            <Reveal className="mx-auto max-w-main px-4">
                {/* items-stretch (default) makes both columns the same height */}
                <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                    {/* Left: contact info */}
                    <div className="flex flex-col gap-8">
                        <div className="space-y-3">
                            <h2 id="contact-title" className="font-heading text-3xl font-bold md:text-4xl">
                                Contact information
                            </h2>
                            <p className="max-w-md text-evergreen/80">
                                We help you find your slot, reduce friction, and keep your game moving.
                            </p>
                        </div>

                        <ul className="space-y-6">
                            {rows.map((r) => {
                                const Icon = r.icon;
                                const content = (
                                    <>
                                        <Icon size={22} aria-hidden className="shrink-0" />
                                        <span className="min-w-0 break-words font-medium">{r.value}</span>
                                    </>
                                );
                                return (
                                    <li key={r.value}>
                                        {r.href ? (
                                            <a
                                                href={r.href}
                                                {...(r.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                                className="flex items-center gap-4 transition-colors hover:text-teal"
                                            >
                                                {content}
                                            </a>
                                        ) : (
                                            <div className="flex items-center gap-4">{content}</div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>

                        {/* Map fills the remaining height so its bottom lines up with the form button */}
                        <div className="relative min-h-64 flex-1 overflow-hidden rounded-2xl border border-evergreen/10">
                            <iframe
                                src={mapSrc}
                                title={`Map showing ${venue.address}`}
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                className="absolute inset-0 h-full w-full border-0"
                                allowFullScreen
                            />
                        </div>
                    </div>

                    {/* Right: form (no card wrapper, same as reference) */}
                    <ContactForm sports={venue.sports} />
                </div>
            </Reveal>
        </Section>
    );
}