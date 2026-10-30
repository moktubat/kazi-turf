// DRAFT legal text. Must be reviewed by the owner or a legal adviser before launch [CONFIRM].
// Set legalStatus.reviewed = true only after that review. Values that need an owner decision
// live in refundConfig so the page never shows invented numbers.
import { houseRules } from "@/data/home";
import { policies, site } from "@/data/site";

export type LegalTab = "terms" | "privacy" | "refund";

export interface LegalSection {
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
}

export interface LegalDoc {
    id: LegalTab;
    label: string;
    intro: string;
    sections: LegalSection[];
}

export const legalStatus = { reviewed: false };

// [CONFIRM] Every value below is an owner decision. null / empty means "not decided yet".
export const refundConfig: {
    tiers: { when: string; outcome: string }[]; // e.g. { when: "More than 24 hours before start", outcome: "..." }
    method: string | null;
    timing: string | null;
    rainCheckEligibility: string | null;
    rainCheckExpiryDays: number | null;
    exceptions: string[];
} = {
    tiers: [],
    method: null,
    timing: null,
    rainCheckEligibility: null,
    rainCheckExpiryDays: null,
    exceptions: [],
};

const terms: LegalDoc = {
    id: "terms",
    label: "Terms",
    intro: `These terms apply when you book a turf or court through ${site.name}.`,
    sections: [
        {
            heading: "Your account",
            paragraphs: [
                "You need an account to pay for a booking. Give accurate details and keep your password private. You are responsible for activity on your account.",
            ],
        },
        {
            heading: "Slots and holds",
            bullets: [
                `Every slot is ${policies.slotMinutes} minutes on a fixed schedule.`,
                `When you continue to payment, your slot is held for ${policies.holdMinutes} minutes. If payment is not completed in that time, the hold is released.`,
                "A booking is confirmed only after we verify your advance payment with bKash. Reaching a success page is not confirmation.",
            ],
        },
        {
            heading: "Prices and payment",
            bullets: [
                "The price per slot is shown before you pay. Peak and off-peak rates apply as listed on the Venues section.",
                `You pay a ${policies.advancePercent}% advance online with bKash. The remaining balance is paid in cash at the venue.`,
                ...(policies.vatRatePercent
                    ? [`VAT of ${policies.vatRatePercent}% is shown as a separate line where it applies.`]
                    : []),
            ],
        },
        {
            heading: "Arrival and check-in",
            bullets: [
                `Show your booking code to staff. Check-in opens ${policies.checkInOpensMinutesBefore} minutes before your slot starts and stays open until it ends.`,
                "Your slot ends at its booked time, so arriving late shortens your playing time.",
            ],
        },
        {
            heading: "Conduct and safety",
            bullets: [
                ...houseRules,
                "Staff may stop a session or refuse entry where safety, property or other players are at risk.",
            ],
        },
        {
            heading: "Venue closures",
            paragraphs: [
                "A pitch may be closed for maintenance or safety. If we need to cancel a booking, we will contact you and handle your advance under the Refund & Rain-check policy.",
            ],
        },
        {
            heading: "Contact",
            paragraphs: [`Questions about these terms: call ${site.phone} or use the contact form on the Home page.`],
        },
    ],
};

const privacy: LegalDoc = {
    id: "privacy",
    label: "Privacy",
    intro: `How ${site.name} handles your personal information.`,
    sections: [
        {
            heading: "What we collect",
            bullets: [
                "Account details: name, phone number, optional email and a securely hashed password.",
                "Booking details: branch, pitch, time, amounts, booking code and check-in record.",
                "Payment results: bKash transaction ID and status.",
                "Messages you send through the contact form.",
            ],
        },
        {
            heading: "What we never see",
            paragraphs: [
                "Your bKash PIN or one-time codes. Payment is completed on bKash, and we only receive the outcome and a transaction ID.",
            ],
        },
        {
            heading: "How we use it",
            bullets: [
                "To create and confirm your booking and let staff check you in.",
                "To contact you about your booking.",
                "To keep our systems secure and prevent abuse.",
            ],
        },
        {
            heading: "Who can see it",
            paragraphs: [
                "Staff see bookings for the branches they are assigned to. Administrators can see all bookings. We share payment details with bKash only to process and verify your payment. We do not sell your personal data.",
            ],
        },
        {
            heading: "Cookies and browser storage",
            paragraphs: [
                "We use one essential cookie to keep you signed in. Your browser also remembers your last branch and sport so the next search is quicker.",
            ],
        },
        {
            heading: "Keeping and correcting your data",
            paragraphs: [
                "You can update your name, phone, email and password in your account. To ask us to correct or delete your data, contact us. We keep booking and payment records as long as needed for accounting and dispute handling.",
            ],
        },
    ],
};

function refundDoc(): LegalDoc {
    const c = refundConfig;
    return {
        id: "refund",
        label: "Refund & Rain-check",
        intro: "What happens to your advance if you cancel, and how rain-checks work.",
        sections: [
            {
                heading: "Your advance",
                paragraphs: [
                    `Your booking is confirmed with a ${policies.advancePercent}% advance paid through bKash. The balance is paid in cash at the venue.`,
                ],
            },
            {
                heading: "Cancelling a booking",
                ...(c.tiers.length > 0
                    ? { bullets: c.tiers.map((t) => `${t.when}: ${t.outcome}`) }
                    : {
                        paragraphs: [
                            "Cancellation deadlines and what happens to the advance are being finalised. Until they are published, send a cancellation request from your account. Our team will confirm what applies before anything is processed. Nothing is cancelled or refunded automatically.",
                        ],
                    }),
            },
            {
                heading: "Refund method and timing",
                paragraphs: [
                    c.method || c.timing
                        ? [c.method, c.timing].filter(Boolean).join(" ")
                        : "If a refund is approved, we will tell you how and when it will be paid.",
                ],
            },
            {
                heading: "Rain-check",
                paragraphs: [
                    "Weather alone does not automatically mean a refund. Where a rain-check is offered, it is recorded as credit on your account, not as a verbal promise.",
                    ...(c.rainCheckEligibility ? [c.rainCheckEligibility] : []),
                    ...(c.rainCheckExpiryDays ? [`Rain-check credit expires after ${c.rainCheckExpiryDays} days.`] : []),
                    ...(!c.rainCheckEligibility && !c.rainCheckExpiryDays
                        ? ["Eligibility and expiry rules are being finalised. Contact the venue if weather affects your booking."]
                        : []),
                ],
            },
            ...(c.exceptions.length > 0 ? [{ heading: "Exceptions", bullets: c.exceptions }] : []),
        ],
    };
}

export const legalDocs: LegalDoc[] = [terms, privacy, refundDoc()];