import type { Branch } from "@/types";
import { shared } from "@/lib/shared";

export const branches: Branch[] = shared<Branch[]>("branches", [
    {
        id: "bogura",
        name: "Kazi Sports Arena",
        slug: "kazi-sports-arena",
        address: "Shabgram, Bogura",
        phone: "+8801354490362",
        whatsapp: "8801354490362",
        mapUrl: "https://maps.app.goo.gl/3ikwjgqMxvGfHUwm8",
        hours: "24 hours",
        status: "ACTIVE",
        sports: ["Football", "Cricket", "Badminton"],
        sportConfigs: [
            { id: "football", name: "Football", image: "/sports/football.jpg", active: true },
            { id: "cricket", name: "Cricket", image: "/sports/cricket.jpg", active: true },
            { id: "badminton", name: "Badminton", image: "/sports/badminton.jpg", active: true },
        ],
    },
]);

export const venue: Branch = branches[0];
export const VENUE_ID = venue.id;