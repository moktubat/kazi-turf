import "server-only";
import { connection } from "next/server";
import { venue as staticVenue } from "@/data/branches";
import { policies as staticPolicies } from "@/data/site";
import { ConfigModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import type { Branch, Policies } from "@/types";
import { refundConfig } from "@/data/legal";

async function getConfig<T>(key: string): Promise<T | null> {
    try {
        // Opt into dynamic rendering: Mongoose internally reads the clock for
        // connection/timestamp logic, which Next.js 16 flags as "unstable new Date()"
        // during prerendering. connection() marks this render as dynamic.
        await connection();
        await connectDb();
        const doc = await ConfigModel.findOne({ key }).lean();
        if (!doc) return null;
        return (doc as unknown as { value: T }).value;
    } catch (e) {
        console.error(`[getConfig:${key}] error:`, e);
        return null;
    }
}

export async function getPublicVenue(): Promise<Branch> {
    const arr = await getConfig<Branch[]>("branches");
    if (arr && arr.length > 0) {
        const match = arr.find((b) => b.id === staticVenue.id) ?? arr[0];
        if (match) return match;
    }
    return staticVenue;
}

export async function getPublicPolicies(): Promise<Policies> {
    const policies = await getConfig<Policies>("policies");
    if (policies) return policies;
    return staticPolicies;
}

export interface RefundPolicyView {
    tiers: { when: string; outcome: string }[];
    method: string;
    timing: string;
    exceptions: string[];
}

/**
 * Refund policy shown on the account profile (separate from `Policies`,
 * which only holds booking rules). Source: refundConfig in @/data/legal,
 * kept in sync with the database by the config layer.
 */
export async function getPublicRefundPolicy(): Promise<RefundPolicyView> {
    // Make sure the live config (including refundConfig) is loaded.
    try {
        await connectDb();
    } catch {
        /* fall back to the in-memory defaults already present in refundConfig */
    }
    return {
        tiers: refundConfig.tiers.map((t) => ({ when: t.when, outcome: t.outcome })),
        method: refundConfig.method ?? "",
        timing: refundConfig.timing ?? "",
        exceptions: [...refundConfig.exceptions],
    };
}