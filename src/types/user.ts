import type { Role } from "@/types";

export interface User {
    id: string;
    name: string;
    email: string | null; // stored lowercase
    phone: string; // normalized: 01XXXXXXXXX
    passwordHash: string;
    role: Role;
    branchIds: string[]; // staff are limited to these
    permissions: string[];
    status: "ACTIVE" | "DISABLED";
    createdAt: string;
}

export interface SessionRecord {
    keyHash: string; // sha256 of the cookie token. The raw token is never stored.
    userId: string;
    expiresAt: string;
    createdAt: string;
}