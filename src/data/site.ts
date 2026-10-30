import { shared } from "@/lib/shared";
import type { Policies } from "@/types";

export const site = {
    name: "KaziTurf",
    tagline: "Lock Your Slot. Own The Pitch.",
    // [CONFIRM] sample numbers, replace with official ones
    phone: "+8801700000000",
    whatsapp: "8801700000000",
    timezone: "Asia/Dhaka",
    currency: "BDT",
};

export const navLinks = [
    { label: "Venues", href: "/#venues" },
    { label: "Rates", href: "/#venues" },
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
    { label: "Refund & Rain-check", href: "/legal#refund" },
];

// Never hard-code these elsewhere. [CONFIRM] all values with the owner.
export const policies: Policies = shared<Policies>("policies", {
    slotMinutes: 90,
    advancePercent: 40,
    holdMinutes: 10,
    checkInOpensMinutesBefore: 30,
    bookingHorizonDays: 14,
    vatRatePercent: null,
    vatMode: "exclusive",
    vatRegistrationNo: "",
});