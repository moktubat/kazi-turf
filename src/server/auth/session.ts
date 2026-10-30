// STUB until Batch 4 (Auth.js credentials + server sessions).
// For local testing before auth exists, set DEV_DEMO_USER=1 in .env.local.
import "server-only";
import type { SessionUser } from "@/types";

export interface ServerUser extends SessionUser {
    phone: string;
}

export async function getSessionUser(): Promise<ServerUser | null> {
    if (process.env.DEV_DEMO_USER === "1" && process.env.NODE_ENV !== "production") {
        return { id: "demo-customer", name: "Demo Customer", role: "CUSTOMER", phone: "01700000000" };
    }
    return null; // TODO(auth batch): read the real session
}