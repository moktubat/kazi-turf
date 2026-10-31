import "server-only";
import { connection } from "next/server";
import { dhakaParts } from "@/lib/time";

/**
 * Request-time "now". `connection()` marks the render as dynamic, so reading the clock
 * after it is allowed under Cache Components.
 */
export async function requestNow(): Promise<Date> {
    await connection();
    return new Date();
}

/** Today's date in Asia/Dhaka as "YYYY-MM-DD". Pass `now` when you already have it. */
export async function todayDhaka(now?: Date): Promise<string> {
    const at = now ?? (await requestNow());
    return dhakaParts(at).date;
}