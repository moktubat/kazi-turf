"use client";
import { useState } from "react";
import { Tabs, type TabItem } from "@/components/ui/Tabs";

// Panels are rendered on the server and passed in, so only the tab state ships as JS.
export function VenueTabs({
    items,
    panels,
    defaultId,
}: {
    items: TabItem[];
    panels: Record<string, React.ReactNode>;
    defaultId: string;
}) {
    const [value, setValue] = useState(defaultId);

    return (
        <>
            <Tabs items={items} value={value} onChange={setValue} label="Branches" />
            <div
                role="tabpanel"
                id={`panel-${value}`}
                aria-labelledby={`tab-${value}`}
                tabIndex={0}
                className="mt-6"
            >
                {panels[value]}
            </div>
        </>
    );
}