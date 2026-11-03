import type { Branch } from "@/types";
import { shared } from "@/lib/shared";

// One facility. The `id` is internal and stable so historical bookings, pitches
// and audit rows keep referencing it. The user-facing name is the brand.
export const branches: Branch[] = shared<Branch[]>("branches", [
    {
        id: "bogura",
        name: "KaziTurf",
        slug: "kaziturf",
        address: "Sample Road, Bogura Sadar, Bogura",
        phone: "+8801700000001",
        whatsapp: "8801700000001",
        mapUrl: "https://maps.google.com/?q=Bogura",
        hours: "06:00 – 24:00",
        status: "ACTIVE",
        sports: ["Football", "Cricket", "Volleyball", "Badminton", "Swimming"],
        sportConfigs: [
            { id: "football", name: "Football", image: "/sports/football.jpg", active: true },
            { id: "cricket", name: "Cricket", image: "/sports/cricket.jpg", active: true },
            { id: "volleyball", name: "Volleyball", image: "/sports/volleyball.jpg", active: true },
            { id: "badminton", name: "Badminton", image: "/sports/badminton.jpg", active: true },
            { id: "swimming", name: "Swimming", image: "/sports/swimming.jpg", active: true },
        ],
    },
]);

export const venue: Branch = branches[0];
export const VENUE_ID = venue.id;