import type { Role } from "@/types";

// DEV-ONLY demo accounts. The store never seeds these in production.
// Real staff and admins are created through /admin/setup (Batch 5) or a seed script.
export const demoUsers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    password: string;
    role: Role;
    branchIds: string[];
    permissions: string[];
}[] = [
        {
            id: "demo-customer",
            name: "Demo Customer",
            phone: "01711111111",
            email: null,
            password: "Demo@12345",
            role: "CUSTOMER",
            branchIds: [],
            permissions: [],
        },
        {
            id: "demo-staff",
            name: "Demo Staff (Bogura)",
            phone: "01722222222",
            email: null,
            password: "Demo@12345",
            role: "STAFF",
            branchIds: ["bogura"],
            permissions: [],
        },
        {
            id: "demo-admin",
            name: "Demo Super Admin",
            phone: "01733333333",
            email: "admin@kaziturf.test",
            password: "Demo@12345",
            role: "SUPER_ADMIN",
            branchIds: [],
            permissions: ["*"],
        },
    ];