import { policies } from "@/data/site";

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
        // The advance is set per sport (Setup → Venue), so the wording names no fixed percentage.
        text: `Pay the advance required for your sport online with bKash to lock your slot. The booking page shows the exact amount before you pay. Your slot is held for ${policies.holdMinutes} minutes while you pay.`,
    },
    {
        id: "play",
        icon: "ticket",
        title: "Play at the arena",
        text: "Show your booking code to our staff at Kazi Sports Arena. Pay the remaining balance in cash at the venue. Check in opens 30 minutes before your slot.",
    },
] as const;

export const houseRules = [
    "Wear turf-safe footwear and socks. Outside shoes and metal studs are not allowed on the courts",
    "Respect staff, other players, and the facility. No fighting or abusive language.",
    "Keep the arena clean. Use the bins provided for trash and bottles.",
    "Follow staff instructions, and remove watches, chains and rings before you play.",
    "Arrive on time. Late arrivals shorten your playing time, not your slot end.",
    "No food on the courts. Water is fine, bottles go in designated areas. No smoking.",
];

export const tickerItems = [
    "Open 24/7",
    "Indoor — Rain or Shine",
    "Football • Cricket • Badminton",
    "Pay bKash advance online",
    "Floodlit courts",
    "Easy online booking",
];