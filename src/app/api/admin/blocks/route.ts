import type { NextRequest } from "next/server";
import { blockSchema } from "@/schemas/admin";
import { staffGuard } from "@/server/admin/guard";
import { setBlock } from "@/server/admin/operations";
import { handleError, ok, readJson } from "@/server/http";

// Block (block: true, reason required) or unblock (block: false) one maintenance cell.
export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        const input = blockSchema.parse(await readJson(req));
        return ok(await setBlock(user, input));
    } catch (e) {
        return handleError(e);
    }
}