import type { NextRequest } from "next/server";
import { pitchSchema, pitchUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createPitch, updatePitch } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";

export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await createPitch(user, pitchSchema.parse(await readJson(req)));
        return ok({ saved: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await updatePitch(user, pitchUpdateSchema.parse(await readJson(req)));
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}