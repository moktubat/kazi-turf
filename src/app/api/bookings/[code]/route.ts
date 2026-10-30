import type { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { getBookingForUser, releaseHold } from "@/server/bookings";
import { AppError, clientIp, handleError, ok } from "@/server/http";
import { reconcileBooking } from "@/server/payments/reconcile";
import { rateLimit } from "@/server/security/rateLimit";

type Ctx = { params: Promise<{ code: string }> };

async function guard(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  // Booking-code lookups are rate limited (spec §10.1).
  if (!rateLimit(`lookup:${user.id}:${clientIp(req)}`, 60, 60_000)) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
  }
  return user;
}

// Server-verified state, used by the result step and its polling.
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const user = await guard(req);
    const { code } = await params;

    const first = getBookingForUser(code, user); // also enforces ownership
    // Still "processing"? Ask bKash now instead of waiting for the next reconcile run.
    if (first.paymentStatus === "PENDING") await reconcileBooking(code);

    return ok({ booking: getBookingForUser(code, user) });
  } catch (e) {
    return handleError(e);
  }
}

// Leave the payment step before paying: release the hold.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const user = await guard(req);
    const { code } = await params;
    releaseHold(code, user);
    return ok({ released: true });
  } catch (e) {
    return handleError(e);
  }
}