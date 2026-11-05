import { venue } from "@/data/branches";
import { Section } from "./Section";
import { VenuePanel } from "./VenuePanel";

export function VenuesSection() {
    if (venue.status !== "ACTIVE") return null;

    return (
        <Section
            id="venues"
            eyebrow="Our fields"
            title="Fields & slots"
            intro="Our fields, slots and location in one place. Prices are per 90-minute slot."
        >
            <VenuePanel venue={venue} />
        </Section>
    );
}