import { venue } from "@/data/branches";
import { Section } from "./Section";
import { VenuePanel } from "./VenuePanel";

export function VenuesSection() {
    if (venue.status !== "ACTIVE") return null;

    return (
        <Section
            id="venues"
            title="Venue & rates"
            intro="Facilities, rates and location in one place. Prices are per 90-minute slot."
        >
            <VenuePanel venue={venue} />
        </Section>
    );
}