"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import type { SetupData, SetupTab } from "@/types/setup";
import { BranchesTab } from "./BranchesTab";
import { PitchesTab } from "./PitchesTab";
import { PoliciesTab } from "./PoliciesTab";
import { RatesTab } from "./RatesTab";
import { StaffTab } from "./StaffTab";

const LABELS: Record<SetupTab, string> = {
    branches: "Branches",
    pitches: "Pitches",
    rates: "Rates",
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
                {tab === "branches" && <BranchesTab branches={data.branches} />}
                {tab === "pitches" && <PitchesTab pitches={data.pitches} branches={data.branches} slotMinutes={data.slotMinutes} />}
                {tab === "rates" && (
                    <RatesTab rates={data.rates} pitches={data.pitches} coverage={data.coverage} slotMinutes={data.slotMinutes} />
                )}
                {tab === "staff" && <StaffTab staff={data.staff} branches={data.branches} />}
                {tab === "policies" && data.policies && <PoliciesTab policies={data.policies} />}
            </div>
        </>
    );
}