"use client";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentTab = (searchParams.get("tab") as SetupTab) ?? initialTab;
    const prevTab = useRef<SetupTab>(currentTab);
    const navRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (prevTab.current !== currentTab) {
            prevTab.current = currentTab;
            router.refresh();
        }
    }, [currentTab, router]);

    useEffect(() => {
        const root = navRef.current;
        if (!root) return;
        const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
        active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, [currentTab]);

    function changeTab(tab: SetupTab) {
        const params = new URLSearchParams(searchParams.toString());
        if (tab === "venue") params.delete("tab");
        else params.set("tab", tab);
        const qs = params.toString();
        router.replace(qs ? `/admin/setup?${qs}` : "/admin/setup", { scroll: false });
    }

    const tab: SetupTab = currentTab;

    return (
        <div className="space-y-5">
            
            <nav
                ref={navRef}
                aria-label="Setup sections"
                className="scrollbar-visible sticky top-16 z-20 -mx-4 flex snap-x snap-mandatory overflow-x-auto scroll-px-4 border-b border-evergreen/10 bg-canvas/95 px-4 py-2.5 backdrop-blur-md lg:hidden"
            >
                <ul className="flex w-max gap-2">
                    {TABS.map(({ id, label, icon: Icon }) => {
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
                    />
                )}
                {tab === "staff" && <StaffTab staff={data.staff} />}
                {tab === "policies" && data.policies && <PoliciesTab policies={data.policies} />}
            </div>
        </div>
    );
}