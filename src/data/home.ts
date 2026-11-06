import { policies } from "@/data/site";

export const getHowSteps = () => [
    {
        id: "pick",
        icon: "calendar",
        title: "Pick your slot",
        text: "Choose your sport, date and time. Check the price and availability before booking.",
    },
    {
        id: "pay",
        icon: "wallet",
        title: "Pay the advance",
        text: `Pay ${policies.advancePercent}% of the total price through bKash to confirm and secure your booking.`,
    },
    {
        id: "play",
        icon: "ticket",
        title: "Confirm at the venue",
        text: "Show your booking code to staff and pay the remaining balance in cash.",
    },
] as const;

// [CONFIRM] house rules with the owner before launch.
export const houseRules = [
    "Wear turf-safe footwear. Metal studs are not allowed.",
    "Respect staff, other players and the facility.",
    "Keep the ground clean. Use the bins provided.",
    "Follow staff instructions at all times.",
];