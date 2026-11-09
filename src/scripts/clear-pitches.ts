import { connectDb } from "@/server/db/connect";
import { ConfigModel } from "@/models";

async function main() {
    await connectDb();

    const before = await ConfigModel.findOne({ key: "pitches" }).lean();
    const beforeArr = (before?.value as any[]) ?? [];
    console.log(`Found ${beforeArr.length} pitches in ConfigModel["pitches"]:`);
    beforeArr.forEach((p: any) => console.log(`  - ${p.id}: ${p.name} (${p.sport})`));

    const now = new Date().toISOString();
    await ConfigModel.updateOne(
        { key: "pitches" },
        { $set: { value: [], updatedAt: now } },
        { upsert: true }
    );
    await ConfigModel.updateOne(
        { key: "pricingRules" },
        { $set: { value: [], updatedAt: now } },
        { upsert: true }
    );

    const after = await ConfigModel.findOne({ key: "pitches" }).lean();
    console.log(`\nVerification: pitches length = ${Array.isArray(after?.value) ? after!.value.length : "N/A"}`);
    console.log("Done.");
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });