import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { venue } from "@/data/branches";
import { Section } from "./Section";
import { VenuePanel } from "./VenuePanel";

export function VenuesSection() {
    if (venue.status !== "ACTIVE") return null;

    return (
        <Section
            id="venues"
            eyebrow="Our fields"
            title="Browse by sport"
            intro="Pick a sport, compare the fields and what each one offers. Prices are per 90-minute slot."
            action={
                <Button href="/book">
                    <CalendarCheck size={18} aria-hidden /> Book a slot
                </Button>
            }
        >
            <VenuePanel venue={venue} />
        </Section>
    );
}