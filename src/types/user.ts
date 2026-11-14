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
    // True after the phone number has been verified via OTP (audit finding CONF-03).
    // Optional so existing docs/users created before OTP was introduced still type-check.
    phoneVerified?: boolean;
}

export interface SessionRecord {
    keyHash: string; // sha256 of the cookie token. The raw token is never stored.
    userId: string;
    expiresAt: string;
    createdAt: string;
}