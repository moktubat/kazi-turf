import { formatHourRange } from "@/lib/format";
import { Section } from "./Section";
import { ContactForm } from "./ContactForm";
import type { Branch } from "@/types";

const heading = "font-heading text-base font-bold text-white";
const text = "mt-1 text-sm text-white/85";
const link = "mt-1 inline-block text-sm font-semibold text-white underline-offset-4 hover:underline";

export function ContactSection({ venue }: { venue: Branch }) {
    if (venue.status !== "ACTIVE") return null;

    return (
        <Section id="contact" eyebrow="Get in touch" title="Contact us" tone="canvas">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
                <div className="rounded-3xl bg-gradient-to-b from-evergreen via-evergreen to-teal px-7 pb-32 pt-8 shadow-lift lg:pb-8">
                    <h3 className="font-heading text-2xl font-extrabold text-white">Get in touch</h3>

                    <div className="mt-8 space-y-7">
                        <div>
                            <p className={heading}>Visit us</p>
                            <p className={text}>Come say hello at our venue.</p>
                            <a
                                href={venue.mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${link} break-words`}
                            >
                                {venue.address}
                            </a>
                        </div>

                        <div>
                            <p className={heading}>Chat to us</p>
                            <p className={text}>Our friendly team is here to help.</p>
                            <a
                                href={`https://wa.me/${venue.whatsapp}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={link}
                            >
                                Message us on WhatsApp
                            </a>
                        </div>

                        <div>
                            <p className={heading}>Call us</p>
                            <p className={text}>Open {formatHourRange(venue.hours)}</p>
                            <a href={`tel:${venue.phone}`} className={link}>
                                {venue.phone}
                            </a>
                        </div>
                    </div>
                </div>

                <ContactForm />
            </div>
        </Section>
    );
}