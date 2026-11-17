import { shared } from "@/lib/shared";
import type { Policies } from "@/types";

export const site = {
    name: "Kazi Sports Arena",
    shortName: "Kazi Sports",
    tagline: "Indoor football, cricket and badminton in Bogura. Open 24/7.",
    // Business details supplied by the owner (source of truth for the site, SEO and structured data).
    phone: "+8801354490362",
    whatsapp: "8801354490362",
    email: "kazisportsarena@gmail.com",
    domain: "kazisports.com",
    url: "https://kazisports.com",
    timezone: "Asia/Dhaka",
    currency: "BDT",
    hours: "Open 24 hours, every day",
    address: { area: "Shabgram", city: "Bogura", country: "Bangladesh", countryCode: "BD" },
    // Default meta description (≈155 characters). Facts only: no rankings or claims we cannot back up.
    seoDescription:
        "Book indoor football, cricket nets and badminton at Kazi Sports Arena in Shabgram, Bogura. Open 24 hours, every day. See live slots and pay the advance by bKash.",
    // Search engines largely ignore keywords; kept short and relevant, never stuffed.
    seoKeywords: [
        "Kazi Sports Arena",
        "indoor football Bogura",
        "turf booking Bogura",
        "cricket net practice Bogura",
        "badminton court Bogura",
        "Shabgram sports arena",
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