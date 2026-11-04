"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import type { SetupData, SetupTab } from "@/types/setup";
import { VenueTab } from "./VenueTab";
import { PitchesTab } from "./PitchesTab";
import { PoliciesTab } from "./PoliciesTab";
import { RatesTab } from "./RatesTab";
import { StaffTab } from "./StaffTab";

const LABELS: Record<SetupTab, string> = {
    venue: "Venue",
    pitches: "Fields",   // was "Pitches"
    rates: "Slots",      // was "Rates"
    staff: "Staff",
    policies: "Policies",
};

export function SetupView({ data }: { data: SetupData }) {
    const [tab, setTab] = useState<SetupTab>(data.tabs[0]);
    return (
        <>
            <Tabs
                label="Setup sections"
                items={data.tabs.map((id) => ({ id, label: LABELS[id] }))}
                value={tab}
                onChange={(id) => setTab(id as SetupTab)}
            />
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="mt-6">
                {tab === "venue" && data.venue && <VenueTab venue={data.venue} />}
                {tab === "pitches" && <PitchesTab pitches={data.pitches} slotMinutes={data.slotMinutes} />}
                {tab === "rates" && (
                    <RatesTab rates={data.rates} pitches={data.pitches} coverage={data.coverage} slotMinutes={data.slotMinutes} />
                )}
                {tab === "staff" && <StaffTab staff={data.staff} />}
                {tab === "policies" && data.policies && <PoliciesTab policies={data.policies} />}
            </div>
        </>
    );
}