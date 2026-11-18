import { policies } from "@/data/site";

/** Night (12 AM–6 AM) advance, worded from the saved percentage — never a fixed claim. */
function nightAdvanceNote(): string {
    const night = policies.nightAdvancePercent ?? 100;
    if (night === policies.advancePercent) return "";
    return night >= 100
        ? " Night slots (12 AM–6 AM) require full payment as advance."
        : ` Night slots (12 AM–6 AM) need a ${night}% advance.`;
}

export const getHowSteps = () => [
    {
        id: "pick",
        icon: "calendar",
        title: "Pick your slot",
        text: "Choose your sport — football, cricket, or badminton. Select a date and time that works for you. Check real-time availability and pricing before you book.",
    },
    {
        id: "pay",
        icon: "wallet",
        title: "Pay the advance",
        text: `Pay ${policies.advancePercent}% of the total online with bKash to lock your slot.${nightAdvanceNote()} Your slot is held for ${policies.holdMinutes} minutes while you pay.`,
    },
    {
        id: "play",
        icon: "ticket",
        title: "Play at the arena",
        text: "Show your booking code to our staff at Kazi Sports Arena. Pay the remaining balance in cash at the venue. Check in opens 30 minutes before your slot.",
    },
] as const;

export const houseRules = [
    "Wear turf-safe footwear. Metal studs are not allowed on the indoor courts.",
    "Respect staff, other players, and the facility at all times.",
    "Keep the arena clean. Use the bins provided for trash and bottles.",
    "Follow staff instructions — they're there to keep everyone safe.",
    "Arrive on time. Late arrivals shorten your playing time, not your slot end.",
    "No food or drinks on the courts. Use the designated areas.",
];

export const tickerItems = [
    "Open 24/7",
    "Indoor — Rain or Shine",
    "Football • Cricket • Badminton",
    "Pay bKash advance online",
    "Floodlit courts",
    "Easy online booking",
];