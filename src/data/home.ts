import { policies } from "@/data/site";

export const getHowSteps = () => [
    {
        id: "pick",
        icon: "calendar",
        title: "Pick a slot",
        text: "Choose your branch, sport, date and time. The price is shown on every slot.",
    },
    {
        id: "pay",
        icon: "wallet",
        title: "Pay the advance with bKash",
        text: `Pay ${policies.advancePercent}% now to confirm your booking.`,
    },
    {
        id: "play",
        icon: "ticket",
        title: "Show your code, pay the balance",
        text: "Show your booking code at the venue and pay the remaining balance in cash.",
    },
] as const;

// [CONFIRM] house rules with the owner before launch.
export const houseRules = [
    "Wear turf-safe footwear. Metal studs are not allowed.",
    "Respect staff, other players and the facility.",
    "Keep the ground clean. Use the bins provided.",
    "Follow staff instructions at all times.",
];