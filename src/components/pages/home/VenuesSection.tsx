import { branches } from "@/data/branches";
import { Section } from "./Section";
import { BranchPanel } from "./BranchPanel";
import { VenueTabs } from "./VenueTabs";

export function VenuesSection() {
    if (branches.length === 0) return null;

    const items = branches.map((b) => ({ id: b.id, label: b.name }));
    const panels = Object.fromEntries(
        branches.map((b) => [b.id, <BranchPanel key={b.id} branch={b} />])
    );
    const defaultId = (branches.find((b) => b.status === "ACTIVE") ?? branches[0]).id;

    return (
        <Section
            id="venues"
            title="Venues & rates"
            intro="Facilities, rates and location in one place. Prices are per 90-minute slot."
        >
            <VenueTabs items={items} panels={panels} defaultId={defaultId} />
        </Section>
    );
}