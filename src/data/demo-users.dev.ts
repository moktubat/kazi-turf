// DEV-ONLY demo accounts. This file MUST NOT be imported from any code path
// that runs in production. The seed script imports it only when SEED_DEMO=1,
// and a runtime guard in seed.ts refuses to seed in production.
import type { Role } from "@/types";

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
            name: "Demo Staff",
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