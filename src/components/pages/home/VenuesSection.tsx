import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Section } from "./Section";
import { VenuePanel } from "./VenuePanel";
import type { Branch } from "@/types";

export function VenuesSection({ venue }: { venue: Branch }) {
    if (venue.status !== "ACTIVE") return null;

    return (
        <Section
            id="venues"
            tone="canvas"
            eyebrow="Our fields"
            title="Browse by sport"
            intro="Indoor football, cricket nets and badminton, open around the clock. Compare the fields, check prices per slot and see each field's slot length."
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