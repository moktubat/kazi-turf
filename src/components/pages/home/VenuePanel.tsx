import { MapPin, Clock, Phone, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { houseRules } from "@/data/home";
import { getBranchPitches } from "@/server/availability";
import type { Branch } from "@/types";
import { PitchCard } from "./PitchCard";

export function VenuePanel({ venue }: { venue: Branch }) {
    const pitches = getBranchPitches(venue.id);
    const facilities = [...new Set(pitches.flatMap((p) => p.facilities))];

    return (
        <div className="space-y-6">
            <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                    <h3 className="text-xl font-bold">{venue.name}</h3>
                    <p className="flex items-center gap-2 text-sm">
                        <MapPin size={16} aria-hidden className="text-teal" /> {venue.address}
                    </p>
                    <p className="flex items-center gap-2 text-sm">
                        <Clock size={16} aria-hidden className="text-teal" /> Open {venue.hours}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button href={venue.mapUrl} variant="outline">
                        <MapPin size={18} aria-hidden /> Open in Maps
                    </Button>
                    <Button href={`tel:${venue.phone}`} variant="secondary">
                        <Phone size={18} aria-hidden /> Call
                    </Button>
                </div>
            </Card>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {pitches.map((p) => (
                    <PitchCard key={p.id} pitch={p} />
                ))}
            </div>

            <Card className="grid gap-6 md:grid-cols-2">
                <div>
                    <h4 className="font-bold">Facilities</h4>
                    <ul className="mt-2 space-y-1.5 text-sm">
                        {facilities.map((f) => (
                            <li key={f} className="flex items-center gap-2">
                                <Check size={16} aria-hidden className="text-teal" /> {f}
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h4 className="font-bold">House rules</h4>
                    <ul className="mt-2 space-y-1.5 text-sm">
                        {houseRules.map((r) => (
                            <li key={r} className="flex items-start gap-2">
                                <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-teal" /> {r}
                            </li>
                        ))}
                    </ul>
                </div>
            </Card>
        </div>
    );
}