// This file is kept for backwards compatibility only. Demo users live in
// `./demo-users.dev.ts` and are imported by the seed script when SEED_DEMO=1.
//
// Do NOT import from this file in production code paths.
export type DemoUser = {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    password: string;
    role: "CUSTOMER" | "STAFF" | "SUPER_ADMIN";
    branchIds: string[];
    permissions: string[];
};

export const demoUsers: DemoUser[] = [];