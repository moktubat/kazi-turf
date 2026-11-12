export const DEFAULT_REFUND_POLICY = {
    tiers: [
        {
            when: "More than 48 hours before your slot",
            outcome:
                "90% of your advance is refunded. 10% is retained as an administrative fee.",
        },
        {
            when: "Between 24 and 48 hours before your slot",
            outcome: "50% of your advance is refunded.",
        },
        {
            when: "Less than 24 hours before your slot",
            outcome:
                "No refund. The full advance is forfeited as the slot could not be rebooked at short notice.",
        },
    ],
    method:
        "Refunds are sent via bKash to the same number used for the advance payment.",
    timing: "Approved refunds are processed within 5–7 business days.",
    exceptions: [
        "No refunds for no-shows or late arrivals beyond 15 minutes.",
        "All turfs are indoor — weather is never a reason for a refund.",
        "If the venue cancels your booking, you receive a 100% refund of the advance.",
        "Refunds apply only to the online advance — the balance paid at the venue is handled directly at the venue.",
    ],
};

export type RefundPolicy = {
    tiers: { when: string; outcome: string }[];
    method: string;
    timing: string;
    exceptions: string[];
};