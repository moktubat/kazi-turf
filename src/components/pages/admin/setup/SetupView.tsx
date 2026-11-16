"use client";
import { useEffect, useRef, useState } from "react";
import { Building2, Clock, FileText, LayoutGrid, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SetupData, SetupTab } from "@/types/setup";
import { VenueTab } from "./VenueTab";
import { PitchesTab } from "./PitchesTab";
import { PoliciesTab } from "./PoliciesTab";
import { RatesTab } from "./RatesTab";
import { StaffTab } from "./StaffTab";

const TABS: { id: SetupTab; label: string; icon: React.ElementType }[] = [
    { id: "venue", label: "Venue", icon: Building2 },
    { id: "pitches", label: "Fields", icon: LayoutGrid },
    { id: "rates", label: "Slots", icon: Clock },
    { id: "staff", label: "Staff", icon: Users },
    { id: "policies", label: "Policies", icon: FileText },
];

export function SetupView({ data, initialTab = "venue" }: { data: SetupData; initialTab?: SetupTab }) {
    // Only the tabs the server says this user may use (Staff with pitches.edit:
    // Fields + Slots). Venue / Staff / Policies save through Super-Admin-only
    // routes, so showing them to Staff only led to "Only a Super Admin" errors.
    const allowed = data.tabs;

    // Every tab's data arrives with the page (data.venue / pitches / rates /
    // staff / policies), so switching tabs is pure client state: instant, with
    // no server round trip and no skeleton. The ?tab= query stays in the address
    // bar via history.replaceState (integrated with the App Router), so deep
    // links and F5-still-opens-the-right-tab keep working without a navigation.
    const [tab, setTab] = useState<SetupTab>(
        allowed.includes(initialTab) ? initialTab : allowed[0] ?? "pitches"
    );
    const navRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const root = navRef.current;
        if (!root) return;
        const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
        active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, [tab]);

    function changeTab(next: SetupTab) {
        setTab(next);
        const params = new URLSearchParams(window.location.search);
        if (next === allowed[0]) params.delete("tab");
        else params.set("tab", next);
        const qs = params.toString();
        window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }

    return (
        <div className="space-y-5">

            <nav
                ref={navRef}
                aria-label="Setup sections"
                className="scrollbar-visible sticky top-16 z-20 -mx-4 flex snap-x snap-mandatory overflow-x-auto scroll-px-4 border-b border-evergreen/10 bg-canvas/95 px-4 py-2.5 backdrop-blur-md lg:hidden"
            >
                <ul className="flex w-max gap-2">
                    {TABS.filter(({ id }) => allowed.includes(id)).map(({ id, label, icon: Icon }) => {
                        const active = tab === id;
                        return (
                            <li key={id} className="shrink-0 snap-center">
                                <button
                                    type="button"
                                    role="tab"
                                    id={`tab-${id}`}
                                    aria-selected={active}
                                    aria-controls={`panel-${id}`}
                                    onClick={() => changeTab(id)}
                                    className={cn(
                                        "inline-flex min-h-12 items-center gap-2 rounded-2xl border px-4 font-heading text-sm font-semibold transition-all",
                                        active
                                            ? "border-teal bg-teal text-white shadow-md"
                                            : "border-evergreen/10 bg-mint text-evergreen hover:border-teal/40 hover:bg-emerald/30"
                                    )}
                                >
                                    <Icon size={16} aria-hidden /> {label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === "venue" && data.venue && <VenueTab venue={data.venue} />}
                {tab === "pitches" && <PitchesTab pitches={data.pitches} slotMinutes={data.slotMinutes} />}
                {tab === "rates" && (
                    <RatesTab
                        rates={data.rates}
                        pitches={data.pitches}
                        coverage={data.coverage}
                        adjustments={data.adjustments}
                        today={data.today}
                    />
                )}
                {tab === "staff" && <StaffTab staff={data.staff} />}
                {tab === "policies" && data.policies && <PoliciesTab policies={data.policies} />}
            </div>
        </div>
    );
}