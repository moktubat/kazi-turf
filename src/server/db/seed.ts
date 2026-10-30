// Run:  npm run seed
// Creates indexes, the first Super Admin (from env) and, only with SEED_DEMO=1, the dev demo accounts.
// Safe to run again: existing accounts are skipped.
import mongoose from "mongoose";
import { demoUsers } from "@/data/users";
import { UserModel } from "@/models";
import { hashPassword } from "@/server/auth/password";
import { connectDb } from "@/server/db/connect";
import { randomUUID } from "crypto";
import { normalizePhone } from "@/lib/phone";

async function addUser(u: {
    name: string;
    phone: string;
    email: string | null;
    password: string;
    role: "CUSTOMER" | "STAFF" | "SUPER_ADMIN";
    branchIds: string[];
    permissions: string[];
}) {
    const phone = normalizePhone(u.phone);
    if (await UserModel.exists({ phone })) {
        console.log(`skip  ${u.role.padEnd(11)} ${phone} (already exists)`);
        return;
    }
    await UserModel.create({
        id: randomUUID(),
        name: u.name,
        email: u.email,
        phone,
        passwordHash: await hashPassword(u.password),
        role: u.role,
        branchIds: u.branchIds,
        permissions: u.permissions,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
    });
    console.log(`added ${u.role.padEnd(11)} ${phone}`);
}

async function main() {
    await connectDb(); // also creates every index, including the unique slot-claim index
    console.log("indexes ready");

    if (process.env.SEED_DEMO === "1") {
        for (const u of demoUsers) await addUser(u);
    }

    const { SEED_ADMIN_NAME: name, SEED_ADMIN_PHONE: phone, SEED_ADMIN_PASSWORD: password } = process.env;
    if (name && phone && password) {
        if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
        await addUser({ name, phone, email: null, password, role: "SUPER_ADMIN", branchIds: [], permissions: ["*"] });
    } else if (process.env.SEED_DEMO !== "1") {
        console.log("No SEED_ADMIN_* set: no Super Admin created.");
    }
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());