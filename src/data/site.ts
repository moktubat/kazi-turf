import { shared } from "@/lib/shared";
import type { Policies } from "@/types";

export const site = {
    name: "Kazi Sports Arena",
    shortName: "Kazi Sports",
    tagline: "Bogura's 24/7 Indoor Sports Arena",
    // Real contact details
    phone: "+8801354490362",
    whatsapp: "8801354490362",
    email: "kazisportsarena@gmail.com",
    domain: "kazisports.com",
    url: "https://kazisports.com",
    timezone: "Asia/Dhaka",
    currency: "BDT",
    // SEO description used in metadata
    seoDescription:
        "Book indoor football, cricket, and badminton courts 24/7 at Kazi Sports Arena in Shabgram, Bogura. Bangladesh's premier indoor sports facility. Pay bKash advance, play rain or shine.",
    seoKeywords: [
        "indoor sports Bogura",
        "turf booking Bangladesh",
        "football turf rental",
        "cricket net practice",
        "badminton court booking",
        "indoor sports arena",
        "Kazi Sports Arena",
        "sports court Bogura",
        "24 hour turf",
        "indoor football pitch",
    ],
};

export const navLinks = [
    { label: "Sports", href: "/#venues" },
    { label: "Pricing", href: "/#venues" },
    { label: "Gallery", href: "/#gallery" },
    { label: "FAQ", href: "/#faq" },
    { label: "Contact", href: "/#contact" },
];

export const footerLinks = [
    { label: "How it works", href: "/#how" },
    { label: "Book a slot", href: "/book" },
    { label: "My account", href: "/account" },
];

export const legalLinks = [
    { label: "Terms", href: "/legal#terms" },
    { label: "Privacy", href: "/legal#privacy" },
    { label: "Refund", href: "/legal#refund" },
];

// Never hard-code these elsewhere. [CONFIRM] all values with the owner.
export const policies: Policies = shared<Policies>("policies", {
    slotMinutes: 90,
    advancePercent: 30,
    nightAdvancePercent: 100,   // 00:00–06:00 = full booking money as advance
    holdMinutes: 10,
    checkInOpensMinutesBefore: 30,
    bookingHorizonDays: 14,
    vatRatePercent: null,
    vatMode: "exclusive",
    vatRegistrationNo: "",
});