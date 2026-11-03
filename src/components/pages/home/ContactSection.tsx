import { MapPin, Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { venue } from "@/data/branches";
import { Section } from "./Section";
import { ContactForm } from "./ContactForm";

export function ContactSection() {
    if (venue.status !== "ACTIVE") return null;

    return (
        <Section id="contact" title="Contact us" intro="Questions about a booking or the venue? Reach us directly or send a message.">
            <div className="grid gap-8 lg:grid-cols-2">
                <Card>
                    <p className="text-sm text-evergreen/80">{venue.address}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button href={`tel:${venue.phone}`} variant="secondary">
                            <Phone size={18} aria-hidden /> Call
                        </Button>
                        <Button href={`https://wa.me/${venue.whatsapp}`} variant="secondary">
                            <MessageCircle size={18} aria-hidden /> WhatsApp
                        </Button>
                        <Button href={venue.mapUrl} variant="outline">
                            <MapPin size={18} aria-hidden /> Map
                        </Button>
                    </div>
                </Card>

                <ContactForm />
            </div>
        </Section>
    );
}