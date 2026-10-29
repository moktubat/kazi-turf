import type { Branch } from "@/types";

// Sample data [CONFIRM]: replace with verified details.
export const branches: Branch[] = [
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
    {
        id: "dhaka",
        name: "Dhaka",
        slug: "dhaka",
        address: "Coming Soon",
        phone: "",
        whatsapp: "",
        mapUrl: "",
        hours: "",
        status: "COMING_SOON",
        sports: [],
    },
];