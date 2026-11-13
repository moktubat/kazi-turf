import type { Branch } from "@/types";
import { shared } from "@/lib/shared";

export const branches: Branch[] = shared<Branch[]>("branches", [
    {
        id: "bogura",
        name: "KaziTurf",
        slug: "kaziturf",
        address: "Shabgram, Bogura",
        phone: "+8801700000001",
        whatsapp: "8801700000001",
        mapUrl: "https://maps.app.goo.gl/3ikwjgqMxvGfHUwm8",
        hours: "24 hours",
        status: "ACTIVE",
        sports: ["Football", "Cricket", "Badminton", "Volly"],
        sportConfigs: [
            { id: "football", name: "Football", image: "/sports/football.jpg", active: true },
            { id: "cricket", name: "Cricket", image: "/sports/cricket.jpg", active: true },
            { id: "badminton", name: "Badminton", image: "/sports/badminton.jpg", active: true },
            { id: "volly", name: "Volly", image: "/sports/volly.jpg", active: true },
        ],
    },
]);

export const venue: Branch = branches[0];
export const VENUE_ID = venue.id;