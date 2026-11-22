// Booking confirmation email for an online customer: sent once, after the booking is
// confirmed (verified bKash advance, or straight away when the sport needs no advance).
import "server-only";
import { dhakaParts, toHHMM } from "@/lib/time";
import { UserModel } from "@/models";
import { getPitch } from "@/server/availability";
import type { Booking } from "@/types/booking";
import { sendEmail } from "./index";
import { bookingConfirmationTemplate } from "./templates";

export async function sendBookingConfirmationEmail(b: Booking): Promise<void> {
    try {
        if (!b.customerId || b.customerId.startsWith("walkin:")) return;

        const user = await UserModel.findOne(
            { id: b.customerId },
            { name: 1, email: 1 }
        ).lean<{ name: string; email: string | null }>();

        if (!user?.email) return;

        const pitch = getPitch(b.pitchId);
        const start = toHHMM(dhakaParts(new Date(b.startAt)).minutes);
        const end = toHHMM(dhakaParts(new Date(b.endAt)).minutes);

        const tpl = bookingConfirmationTemplate({
            name: user.name || b.customerName || "Customer",
            code: b.bookingCode,
            pitchName: pitch?.name ?? "the venue",
            sport: pitch?.sport ?? "",
            date: b.date,
            start,
            end,
            total: b.total,
            advance: b.advanceAmount,
            balance: b.balanceAmount,
        });

        // One confirmation per booking, even if two code paths confirm it.
        await sendEmail(
            { to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text },
            { flow: "booking_confirmation", idempotencyKey: `booking-confirmed-${b.id}` }
        );
    } catch (e) {
        console.error(
            "[email] booking confirmation failed:",
            e instanceof Error ? e.message : e
        );
    }
}
