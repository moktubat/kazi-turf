import type { Branch } from "@/types";
import { shared } from "@/lib/shared";

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

export const boguraBranch = branches[0];