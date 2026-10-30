import type { NextRequest } from "next/server";
import { rateDeleteSchema, rateSchema, rateUpdateSchema } from "@/schemas/setup";
import { staffGuard } from "@/server/admin/guard";
import { createRate, deleteRate, updateRate } from "@/server/admin/setup";
import { handleError, ok, readJson } from "@/server/http";

export async function POST(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await createRate(user, rateSchema.parse(await readJson(req)));
        return ok({ saved: true }, 201);
    } catch (e) {
        return handleError(e);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await updateRate(user, rateUpdateSchema.parse(await readJson(req)));
        return ok({ saved: true });
    } catch (e) {
        return handleError(e);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const user = await staffGuard(req, true);
        await deleteRate(user, rateDeleteSchema.parse(await readJson(req)).id);
        return ok({ deleted: true });
    } catch (e) {
        return handleError(e);
    }
}