import "server-only";
import { BookingModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import { plainAll } from "@/server/db/util";
import type { Booking } from "@/types/booking";
import { SETTLEABLE, settle } from "./index";

/** Expired unpaid holds become EXPIRED and free their cells. `scope` narrows by branch, for example. */
export async function settleExpired(scope: Record<string, unknown>, now: Date, limit = 200) {
    await connectDb();
    const docs = await BookingModel.find({
        ...scope,
        bookingStatus: "PENDING_PAYMENT",
        paymentStatus: { $in: SETTLEABLE },
        holdExpiresAt: { $lte: now.toISOString() },
    })
        .limit(limit)
        .lean();
    for (const b of plainAll<Booking>(docs)) await settle(b, now);
}