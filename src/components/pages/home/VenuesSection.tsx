import { branches } from "@/data/branches";
import { Section } from "./Section";
import { BranchPanel } from "./BranchPanel";

export function VenuesSection() {
    if (branches.length === 0) return null;
    const branch = branches[0];

    return (
        <Section
            id="venues"
            title="Venue & rates"
            intro="Facilities, rates and location in one place. Prices are per 90-minute slot."
        >
            <BranchPanel branch={branch} />
        </Section>
    );
}