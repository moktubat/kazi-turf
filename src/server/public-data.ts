import "server-only";
import { venue as staticVenue } from "@/data/branches";
import { policies as staticPolicies } from "@/data/site";
import { ConfigModel } from "@/models";
import { connectDb } from "@/server/db/connect";
import type { Branch, Policies } from "@/types";

async function getConfig<T>(key: string): Promise<T | null> {
    try {
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