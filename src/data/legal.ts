// DRAFT legal text. Must be reviewed by the owner or a legal adviser before launch [CONFIRM].
// Set legalStatus.reviewed = true only after that review. Values that need an owner decision
// live in refundConfig so the page never shows invented numbers.
//
// Every statement below describes how the booking system actually works (holds, advance,
// verification, cancellation requests, refunds recorded by the venue, what data is stored and
// for how long). Refund amounts, method and timing come ONLY from the owner's saved policy.
import { venue } from "@/data/branches";
import { houseRules } from "@/data/home";
import { policies, site } from "@/data/site";
import { sportAdvanceLines } from "@/lib/advance";
import { shared } from "@/lib/shared";

export type LegalTab = "terms" | "privacy" | "refund";

export interface LegalSection {
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
}

export interface LegalDoc {
    id: LegalTab;
    /** Short tab label (fits three tabs on a phone). */
    label: string;
    /** Full document name, shown as the heading. */
    title: string;
    intro: string;
    sections: LegalSection[];
}

export const legalStatus = shared("legalStatus", { reviewed: false });

export interface RefundConfig {
    tiers: { when: string; outcome: string }[];
    method: string | null;
    timing: string | null;
    exceptions: string[];
}

// [CONFIRM] Every value is an owner decision. Edited in Admin > Setup > Policies.
export const refundConfig = shared<RefundConfig>("refundConfig", {
    tiers: [],
    method: null,
    timing: null,
    exceptions: [],
});

/** The owner's refund settings as shown to customers (see server/public-data). */
export interface RefundView {
    tiers: { when: string; outcome: string }[];
    method: string;
    timing: string;
    exceptions: string[];
}

/** True when the owner has saved any refund rule. Without one, no amounts or deadlines are shown. */
export const hasRefundRules = (r: RefundView) =>
    r.tiers.length > 0 || !!r.method?.trim() || !!r.timing?.trim() || r.exceptions.length > 0;

/** Wording used wherever refund rules are not published yet. Promises nothing. */
export const REFUND_RULES_PENDING =
    "Our cancellation and refund rules are being finalised. Until they are published here, send a cancellation request from your account and our team will tell you what applies before anything is cancelled or refunded.";

// Advance payment is set per sport (Setup → Venue), so the terms list each sport's live
// percentage instead of one fixed figure.
function advanceLines(): string[] {
    const bySport = sportAdvanceLines(venue, policies);
    return [
        "The advance you pay online with bKash depends on the sport you book and, for some sports, on whether the slot starts between 12 AM and 6 AM. The exact amount is shown before you pay. The rest is paid in cash at the arena.",
        ...(bySport.length > 0 ? [`Current advance by sport: ${bySport.join("; ")}.`] : []),
        "Where a sport needs no advance, your booking is confirmed straight away without an online payment, and the full price is paid at the arena.",
    ];
}

const terms = (): LegalDoc => ({
    id: "terms",
    label: "Terms",
    title: "Terms & Conditions",
    intro: `These terms apply when you book a field or court at ${site.name}, ${site.address.area}, ${site.address.city}, online or at the counter. By booking, you agree to them.`,
    sections: [
        {
            heading: "Your account",
            bullets: [
                "You need an account to hold and pay for a slot online. We confirm your email address with a 6-digit code when you sign up.",
                "Give accurate details, especially your mobile number, so we can reach you about your booking.",
                "Keep your password private. You are responsible for bookings made from your account.",
            ],
        },
        {
            heading: "Slots and booking",
            bullets: [
                `${site.name} is ${site.hours.toLowerCase()}. You can book open slots up to ${policies.bookingHorizonDays} days ahead.`,
                "Each field or court has its own slot length, shown on the booking page. Slots run back to back on a fixed schedule.",
                "You can book back-to-back slots on the same field, up to the limit shown for that field.",
                `When you continue to payment, the slot is held for you for ${policies.holdMinutes} minutes. If payment is not completed in that time, the hold ends and the slot is released.`,
                "You can have one unpaid hold at a time. Starting a new booking releases your previous unpaid hold.",
            ],
        },
        {
            heading: "Prices and payment",
            bullets: [
                "Prices are per slot and are shown before you pay. They can differ by day and time, and special prices show the original price alongside.",
                "The price shown when you continue to payment is the price of your booking, even if prices change later.",
                ...advanceLines(),
                ...(policies.vatRatePercent ? [`Where VAT applies (${policies.vatRatePercent}%), it is shown as a separate line before you pay.`] : []),
                "Where an advance is due, your booking is confirmed only after we verify it with bKash. Reaching a payment success page is not, on its own, confirmation.",
            ],
        },
        {
            heading: "Booking at the counter",
            paragraphs: [
                "Our staff can book a free slot for you at the arena. Counter bookings are paid in cash; anything not paid when the booking is made is paid later at the counter.",
            ],
        },
        {
            heading: "Arrival, check-in and late arrival",
            bullets: [
                `Show your booking code to our staff. Check-in opens ${policies.checkInOpensMinutesBefore} minutes before your slot starts and stays open until the slot ends.`,
                "Staff may confirm your identity using the last 4 digits of your booking phone number or your name.",
                "Your slot ends at its booked time. Arriving late shortens your playing time; the slot is not extended.",
                "Any balance is paid in cash at the arena.",
            ],
        },
        {
            heading: "Changes and cancellations",
            bullets: [
                "To cancel or reschedule, open the booking in your account and send a request with a short reason. Our team reviews every request and contacts you.",
                "Nothing is cancelled or refunded automatically. What happens to your advance is explained in the Refund Policy.",
                "If we have to cancel your booking, for example because a field is closed for maintenance or safety, we will contact you and handle any money you paid under the Refund Policy.",
            ],
        },
        {
            heading: "Using the arena",
            bullets: [
                ...houseRules,
                "Our staff may stop a session or refuse entry where the safety of players, staff or the facility is at risk.",
            ],
        },
        {
            heading: "Changes to these terms",
            paragraphs: [
                "We may update these terms. The version on this page applies to bookings made after the change.",
            ],
        },
        {
            heading: "Contact",
            paragraphs: [
                `Questions about these terms: call ${site.phone}, message us on WhatsApp, or email ${site.email}.`,
            ],
        },
    ],
});

const privacy = (): LegalDoc => ({
    id: "privacy",
    label: "Privacy",
    title: "Privacy Policy",
    intro: `This explains what information ${site.name} collects when you use this website or book with us, why we need it, and the choices you have.`,
    sections: [
        {
            heading: "Information we collect",
            bullets: [
                "Account details: your name, mobile number and email address. Your password is stored only as a secure one-way hash; we cannot read it.",
                "Booking details: the field, date and time, prices and amounts, your booking code, booking status, check-in time, and any cancellation or reschedule request you send.",
                "Payment details: for bKash payments, the bKash payment ID, transaction ID, amount and result. For cash payments at the counter, the amount and the staff member who recorded it.",
                "Messages you send through the contact form: your name, email, phone number, sport, subject and message.",
                "Technical information: your IP address, used to prevent abuse and limit repeated attempts (for example on sign-in, sign-up codes and online bookings).",
            ],
        },
        {
            heading: "What we never receive",
            paragraphs: [
                "Your bKash PIN or one-time codes. You complete payment on bKash's own page, and we only receive the result and the transaction details listed above.",
            ],
        },
        {
            heading: "How we use your information",
            bullets: [
                "To create your account, confirm your email address and keep you signed in.",
                "To hold, confirm and manage your bookings, verify payments, and let staff check you in.",
                "To send you service emails: sign-up and email-change codes, password reset links and booking confirmations.",
                "To contact you about a booking, a request you sent, or a refund.",
                "To keep the website secure and prevent fraud and abuse.",
            ],
        },
        {
            heading: "Who can see it",
            bullets: [
                "Our staff can see the bookings and customer details they need to run the arena. Administrators can see all bookings and payment records.",
                "bKash receives the details needed to process and verify your payment.",
                "We use service providers to host the website and database and to deliver our emails. They handle your information only to provide that service.",
                "We may share information if the law requires it.",
                "We do not sell your personal information.",
            ],
        },
        {
            heading: "How long we keep it",
            bullets: [
                "Account and booking information is kept while you have an account, and booking and payment records for as long as needed for accounting and to resolve disputes.",
                "Contact form messages are deleted automatically after one year.",
                "Email confirmation codes expire after 10 minutes, and their records are deleted within a day. Password reset links expire after 15 minutes.",
                "A sign-in session lasts up to 7 days, or until you log out.",
            ],
        },
        {
            heading: "How we protect it",
            paragraphs: [
                "The website uses an encrypted (HTTPS) connection. Passwords are stored as one-way hashes, and your sign-in is kept in a secure cookie that page scripts cannot read. Access to staff tools is limited by role. No system is completely secure, but we take reasonable steps to protect your information.",
            ],
        },
        {
            heading: "Cookies and browser storage",
            paragraphs: [
                "We use one essential cookie to keep you signed in. Your browser may also remember the sport you last chose so your next search is quicker. We do not use advertising cookies.",
            ],
        },
        {
            heading: "Your choices and rights",
            bullets: [
                "You can view and update your name, mobile number, email address and password in your account. A new email address is confirmed with a code before it is used.",
                `To ask for a copy of your information, a correction, or deletion of your account, contact us at ${site.email}. Some booking and payment records may need to be kept for accounting.`,
            ],
        },
        {
            heading: "Contact",
            paragraphs: [`Privacy questions: email ${site.email} or call ${site.phone}.`],
        },
    ],
});

function refundDoc(r: RefundView): LegalDoc {
    const rules = hasRefundRules(r);
    return {
        id: "refund",
        label: "Refund",
        title: "Refund Policy",
        intro: "What happens to your money if a booking is cancelled, a payment fails, or you are charged twice.",
        sections: [
            {
                heading: "What can be refunded",
                bullets: [
                    ...advanceLines(),
                    "Refunds concern money you have actually paid: the online advance, and any balance already paid at the counter.",
                ],
            },
            {
                heading: "How to cancel",
                paragraphs: [
                    "Open the booking in your account and send a cancellation request with a short reason. Our team reviews it and contacts you. Nothing is cancelled or refunded automatically.",
                ],
            },
            ...(rules && r.tiers.length > 0
                ? [{ heading: "Cancellation and refund amounts", bullets: r.tiers.map((t) => `${t.when}: ${t.outcome}`) }]
                : [{ heading: "Cancellation and refund amounts", paragraphs: [rules ? "Our team confirms what applies when you send a cancellation request." : REFUND_RULES_PENDING] }]),
            {
                heading: "If we cancel your booking",
                paragraphs: [
                    "If we have to cancel a booking you have paid for, the money you paid is marked for refund and our team contacts you to arrange it.",
                ],
            },
            {
                heading: "Failed or interrupted payments",
                bullets: [
                    "If a bKash payment fails or you cancel it, the booking is not confirmed. You can try again while your slot is still held.",
                    "If a payment is completed after your hold has ended and the slot is still free, your booking is confirmed. If someone else has booked the slot by then, your payment is marked for refund.",
                    "If money left your bKash account but your booking does not show as confirmed, contact us with your booking code and we will check it with bKash.",
                ],
            },
            {
                heading: "Duplicate or incorrect payments",
                paragraphs: [
                    "Every payment is checked with bKash. If a booking is paid twice, or a payment does not match the booking, it is flagged for our team to review, and an extra payment is refunded.",
                ],
            },
            {
                heading: "How refunds are paid",
                paragraphs: [
                    [r.method, r.timing].filter((x) => x && x.trim()).join(" ") ||
                        "When a refund is approved, our team tells you how and when it will be paid.",
                    "You can follow the status in the Refunds tab of your account: it shows \"Refund pending\" until the refund is paid, then \"Refunded\".",
                ],
            },
            ...(r.exceptions.length > 0 ? [{ heading: "Exceptions", bullets: r.exceptions }] : []),
            {
                heading: "Questions",
                paragraphs: [`About a refund: call ${site.phone}, message us on WhatsApp, or email ${site.email}. Please have your booking code ready.`],
            },
        ],
    };
}

/** Owner's saved refund settings in the shape refundDoc needs. */
const savedRefund = (): RefundView => ({
    tiers: refundConfig.tiers,
    method: refundConfig.method ?? "",
    timing: refundConfig.timing ?? "",
    exceptions: refundConfig.exceptions,
});

export const getLegalDocs = (refund: RefundView = savedRefund()): LegalDoc[] => [terms(), privacy(), refundDoc(refund)];
