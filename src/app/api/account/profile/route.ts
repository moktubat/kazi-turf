import type { NextRequest } from "next/server";
import { profileSchema } from "@/schemas/account";
import { requireUser } from "@/server/auth/guards";
import { updateProfile } from "@/server/auth/users";
import { clientIp, handleError, ok, readJson } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";

export async function PATCH(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await requireUser();
        const input = profileSchema.parse(await readJson(req));
        // Await: otherwise a failed save (e.g. phone already used) was reported as success.
        return ok({ profile: await updateProfile(user.id, input, { ip: clientIp(req) }) });
    } catch (e) {
        return handleError(e);
    }
}