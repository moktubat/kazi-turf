"use client";
import type { SetupData, SetupTab } from "@/types/setup";
import { VenueTab } from "./VenueTab";
import { PitchesTab } from "./PitchesTab";
import { PoliciesTab } from "./PoliciesTab";
import { RatesTab } from "./RatesTab";
import { StaffTab } from "./StaffTab";

export function SetupView({ data, initialTab = "venue" }: { data: SetupData; initialTab?: SetupTab }) {
    const tab: SetupTab = initialTab;

    return (
        <div className="space-y-5">
            {tab === "venue" && data.venue && <VenueTab venue={data.venue} />}
            {tab === "pitches" && <PitchesTab pitches={data.pitches} slotMinutes={data.slotMinutes} />}
            {tab === "rates" && (
                <RatesTab
                    rates={data.rates}
                    pitches={data.pitches}
                    coverage={data.coverage}
                    slotMinutes={data.slotMinutes}
                />
            )}
            {tab === "staff" && <StaffTab staff={data.staff} />}
            {tab === "policies" && data.policies && <PoliciesTab policies={data.policies} />}
        </div>
    );
}