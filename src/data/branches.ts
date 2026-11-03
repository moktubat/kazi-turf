import type { Branch } from "@/types";
import { shared } from "@/lib/shared";

/**
 * Single-venue source of truth. The array shape is kept so historical
 * booking/audit rows that store `branchId: "bogura"` remain valid,
 * but the app never iterates this as if more branches could exist.
 */
export const branches: Branch[] = shared<Branch[]>("branches", [
    {
        id: "bogura",
        name: "Bogura",
        slug: "bogura",
        address: "Sample Road, Bogura Sadar, Bogura",
        phone: "+8801700000001",
        whatsapp: "8801700000001",
        mapUrl: "https://maps.google.com/?q=Bogura",
        hours: "06:00 – 24:00",
        status: "ACTIVE",
        sports: ["Football", "Cricket"],
    },
]);

/** The one and only venue. Use this everywhere instead of `branches[0]`. */
export const venue: Branch = branches[0];

/** Convenience for server code that still takes a branchId argument. */
export const VENUE_ID = venue.id;