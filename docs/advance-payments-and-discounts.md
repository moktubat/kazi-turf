# Sport-wise advance payment and walk-in discounts

## Advance payment per sport

**Where:** Admin → Setup → **Venue** → *Sports offered* → each sport card → **Advance payment**.

Each sport has two percentages, any whole number from **0 to 100**:

| Field                 | Applies to bookings whose first slot starts |
| --------------------- | ------------------------------------------- |
| Day (%) · 6 AM–12 AM  | 06:00 to midnight (Dhaka time)              |
| Night (%) · 12 AM–6 AM | midnight to 06:00 (Dhaka time)             |

- **0%** — no advance. An online booking is confirmed straight away without any bKash payment and
  the whole price is paid at the venue (it shows as "Not paid" with the full balance due, exactly
  like a walk-in booked with no advance).
- **1–99%** — that share of the total is paid online by bKash; the rest at the venue. A low
  percentage never rounds down to ৳0.
- **100%** — the full price is paid online.

Example: Badminton 30%, Football 50%, Cricket 20%, Table Tennis 0% — each sport keeps its own value.

Where it is used:

- **Online booking (/book):** the price summary, the bKash amount and the balance are worked out
  from the selected sport's percentage by the server (`src/server/pricing` → `quote`).
- **Walk-in (Staff Desk):** the form suggests the sport's advance; staff can still take any amount
  from ৳0 to the total (unchanged counter rule).
- **Customer text:** the FAQ and How-it-works describe the advance generically; the Terms list each
  active sport's live percentage.

Existing data stays safe:

- Sports saved before this change have no percentage of their own and keep using the old
  venue-wide values (shown and prefilled in the Venue tab). Saving the sport stores its own value.
- A new sport starts from those venue-wide values.
- Bookings already made keep the advance, balance and percentage they were created with.
- The venue-wide values are no longer edited in Policies; they are kept only as this fallback.
- No database migration is needed: the new fields are optional and read with a fallback.

## Walk-in discount

**Where:** Staff Desk → tap a free slot → **Add walk-in** → *Discount (optional)*.

- Choose **৳ Taka** (fixed amount) or **% Percent**, and enter a whole number.
- The discount comes off the subtotal; VAT (if enabled) is worked out again on the reduced amount.
- The form shows **Original price**, **Discount** and **Payable**. Cash received, the quick picks
  and the balance all follow the payable amount.
- Limits: 0–100% or up to the subtotal in taka, so the payable total can reach ৳0 but never go
  negative. The server checks the same rules (`src/lib/counterDiscount.ts`).
- Anyone allowed to create walk-ins (Staff of the branch, Super Admin) can apply a discount.
- The discount is saved on the booking (`discountAmount`, `discountType`, `discountValue`; the
  booking `total` is the payable amount), written to the audit log with the original total, and
  shown on the booking panel, the customer's booking view, the printed receipt, the confirmation
  email and the CSV export (new last column "Discount").
