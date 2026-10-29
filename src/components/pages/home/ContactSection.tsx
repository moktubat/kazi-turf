import { MapPin, Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { branches } from "@/data/branches";
import { Section } from "./Section";
import { ContactForm } from "./ContactForm";

export function ContactSection() {
    const active = branches.filter((b) => b.status === "ACTIVE");

    return (
        <Section id="contact" title="Contact us" intro="Questions about a booking or a venue? Reach us directly or send a message.">
            <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-4">
                    {active.map((b) => (
                        <Card key={b.id}>
                            <h3 className="text-lg font-bold">{b.name}</h3>
                            <p className="mt-1 text-sm text-evergreen/80">{b.address}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button href={`tel:${b.phone}`} variant="secondary">
                                    <Phone size={18} aria-hidden /> Call
                                </Button>
                                <Button href={`https://wa.me/${b.whatsapp}`} variant="secondary">
                                    <MessageCircle size={18} aria-hidden /> WhatsApp
                                </Button>
                                <Button href={b.mapUrl} variant="outline">
                                    <MapPin size={18} aria-hidden /> Map
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>

                <ContactForm />
            </div>
        </Section>
    );
}