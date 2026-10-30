import type { NextRequest } from "next/server";
import { profileSchema } from "@/schemas/account";
import { requireUser } from "@/server/auth/guards";
import { updateProfile } from "@/server/auth/users";
import { handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";

export async function PATCH(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await requireUser();
        const input = profileSchema.parse(await readJson(req));
        return ok({ profile: updateProfile(user.id, input) });
    } catch (e) {
        return handleError(e);
    }
}